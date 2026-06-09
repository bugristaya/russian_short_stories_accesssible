// Background script for handling LangGraph integration and API calls

// Import the LangGraph agent
import { LangGraphAgent } from './langgraph-agent.js';

class LangGraphAssistant {
  constructor() {
    this.apiKey = null;
    this.baseUrl = 'http://localhost:8090/api/v1'; // Default to OpenAI, can be configured
    this.langsmithApiKey = null; // LangSmith API key for tracing
    this.langsmithProject = 'browser-assistant'; // LangSmith project name
    this.agents = new Map(); // Store agents by thread ID
    this.initialized = false;
    this.init();
  }

  init() {
    try {
      console.log('LangGraphAssistant: Initializing...');
      
      // Set up message listener immediately
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('LangGraphAssistant: Received message:', request.action);
        this.handleMessage(request, sender, sendResponse);
        return true; // Keep message channel open for async response
      });

      // Load API key from storage asynchronously
      this.loadApiKey();
      
      console.log('LangGraphAssistant: Initialization complete');
      this.initialized = true;
    } catch (error) {
      console.error('LangGraphAssistant: Initialization failed:', error);
    }
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.sync.get(['apiKey', 'baseUrl', 'langsmithApiKey', 'langsmithProject']);
      this.apiKey = result.apiKey;
      if (result.baseUrl) {
        this.baseUrl = result.baseUrl;
      }
      if (result.langsmithApiKey) {
        this.langsmithApiKey = result.langsmithApiKey;
      }
      if (result.langsmithProject) {
        this.langsmithProject = result.langsmithProject;
      }
      console.log('LangGraphAssistant: API key loaded:', this.apiKey ? 'Yes' : 'No');
      console.log('LangGraphAssistant: LangSmith API key loaded:', this.langsmithApiKey ? 'Yes' : 'No');
    } catch (error) {
      console.error('LangGraphAssistant: Failed to load API key:', error);
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      // Ensure we're initialized
      if (!this.initialized) {
        console.log('LangGraphAssistant: Not yet initialized, waiting...');
        // Wait a bit for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('LangGraphAssistant: Handling message:', request.action);
      
      switch (request.action) {
        case 'analyzePage':
          const analysis = await this.analyzePage(request.data);
          sendResponse({ summary: analysis });
          break;
        
        case 'chatMessage':
          const response = await this.processChatMessage(request.message, request.pageData, request.threadId);
          sendResponse({ response: response });
          break;
        
        case 'setApiKey':
          try {
            await this.setApiKey(request.apiKey, request.baseUrl, request.langsmithApiKey, request.langsmithProject);
            sendResponse({ success: true });
          } catch (error) {
            console.error('Error setting API key:', error);
            sendResponse({ success: false, error: error.message });
          }
          break;
        
        case 'getAgentStatus':
          const status = this.getAgentStatus(request.threadId);
          sendResponse({ status: status });
          break;
        
        case 'clearAgentHistory':
          this.clearAgentHistory(request.threadId);
          sendResponse({ success: true });
          break;
        
        case 'test':
          sendResponse({ 
            success: true, 
            message: 'Фоновый скрипт работает',
            initialized: this.initialized,
            apiKeyLoaded: !!this.apiKey,
            agentCount: this.agents.size
          });
          break;
        
        default:
          sendResponse({ error: 'Неизвестное действие' });
      }
    } catch (error) {
      console.error('Error in background script:', error);
      sendResponse({ error: error.message });
    }
  }

  async analyzePage(pageData) {
    if (!this.apiKey) {
      return 'Пожалуйста, настройте API-ключ в настройках расширения';
    }

    const prompt = `Проанализируйте следующую веб-страницу и кратко изложите ее содержание:

URL: ${pageData.url}
Заголовок: ${pageData.title}
Содержимое: ${pageData.content}
Пожалуйста, предоставьте:

Краткое описание, о чём эта страница
Основные темы или ключевые тематики
Заметная информация или важные выводы
Предложения о том, что пользователю может быть полезно узнать дополнительно
Сделайте ответ кратким и полезным.`
;

    try {
      const response = await this.callOpenAI(prompt);
      return response;
    } catch (error) {
      console.error('Error analyzing page:', error);
      return 'Sorry, I encountered an error while analyzing this page. Please check your API key and try again.';
    }
  }

  async processChatMessage(message, pageData, threadId = null) {
    if (!this.apiKey) {
      return 'Please configure your API key in the extension settings.';
    }

    try {
      // Get or create agent for this thread
      let agent = this.agents.get(threadId);
      if (!agent) {
        // Import LangGraphAgent (assuming it's available)
        if (typeof LangGraphAgent === 'undefined') {
          // Fallback to simple response if LangGraphAgent not available
          return await this.simpleChatResponse(message, pageData);
        }
        
        console.log('LangGraphAssistant: Creating agent with params:', {
          apiKey: this.apiKey ? '***' + this.apiKey.slice(-4) : 'missing',
          baseUrl: this.baseUrl,
          langsmithApiKey: this.langsmithApiKey ? '***' + this.langsmithApiKey.slice(-4) : 'missing',
          langsmithProject: this.langsmithProject
        });
        
        agent = new LangGraphAgent(this.apiKey, this.baseUrl, this.langsmithApiKey, this.langsmithProject);
        await agent.initialize(pageData, threadId);
        this.agents.set(threadId, agent);
        console.log('LangGraphAssistant: Created new agent for thread:', threadId);
      }

      // Process message using the agent
      const response = await agent.processMessage(message);
      return response;
    } catch (error) {
      console.error('Error processing chat message:', error);
      return 'Sorry, I encountered an error processing your message. Please try again.';
    }
  }

  // Fallback simple chat response if LangGraphAgent is not available
  async simpleChatResponse(message, pageData) {
    const contextPrompt = `Ты полезный браузерный ассистент. Пользователь сейчас находится на этой веб-странице:

URL: ${pageData.url}
Заголовок: ${pageData.title}
Содержание: ${pageData.content}

Вопрос пользователя: ${message}

Пожалуйста, предоставь полезный ответ, основываясь на содержании веб-странице и вопросе пользователя. Если вопрос не относится к текущей странице, ты всё равно можешь помочь, но упомяни, что не уверен в контексте текущей страницы.`;

    return await this.callOpenAI(contextPrompt);
  }

  async callOpenAI(prompt) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'GigaChat-2',
        messages: [
          {
            role: 'system',
            content: 'Ты — полезный браузерный помощник, который анализирует веб-страницы и отвечает на вопросы об их содержании. Будь краткими, полезными и точными.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.5
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async setApiKey(apiKey, baseUrl, langsmithApiKey, langsmithProject) {
    try {
      console.log('Setting API key:', { 
        apiKey: apiKey ? '***' + apiKey.slice(-4) : 'empty', 
        baseUrl,
        langsmithApiKey: langsmithApiKey ? '***' + langsmithApiKey.slice(-4) : 'empty',
        langsmithProject
      });
      
      this.apiKey = apiKey;
      if (baseUrl) {
        this.baseUrl = baseUrl;
      }
      if (langsmithApiKey) {
        this.langsmithApiKey = langsmithApiKey;
      }
      if (langsmithProject) {
        this.langsmithProject = langsmithProject;
      }
      
      // Save to Chrome storage
      await chrome.storage.sync.set({
        apiKey: apiKey,
        baseUrl: baseUrl || this.baseUrl,
        langsmithApiKey: langsmithApiKey || this.langsmithApiKey,
        langsmithProject: langsmithProject || this.langsmithProject
      });
      
      console.log('API key and LangSmith settings saved successfully');
    } catch (error) {
      console.error('Error in setApiKey:', error);
      throw new Error(`Failed to save API key: ${error.message}`);
    }
  }

  // Get agent status
  getAgentStatus(threadId) {
    if (!threadId) {
      return { error: 'Thread ID required' };
    }
    
    const agent = this.agents.get(threadId);
    if (!agent) {
      return { error: 'Agent not found for thread' };
    }
    
    return agent.getStatus();
  }

  // Clear agent history
  clearAgentHistory(threadId) {
    if (!threadId) {
      return { error: 'Thread ID required' };
    }
    
    const agent = this.agents.get(threadId);
    if (agent) {
      agent.clearHistory();
      console.log('LangGraphAssistant: Cleared history for thread:', threadId);
    }
  }

  // Get all active agents
  getAllAgents() {
    const agents = {};
    for (const [threadId, agent] of this.agents.entries()) {
      agents[threadId] = agent.getStatus();
    }
    return agents;
  }

  // Clean up old agents (optional maintenance)
  cleanupOldAgents(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const now = Date.now();
    for (const [threadId, agent] of this.agents.entries()) {
      const status = agent.getStatus();
      if (status.lastActivity) {
        const lastActivity = new Date(status.lastActivity).getTime();
        if (now - lastActivity > maxAge) {
          this.agents.delete(threadId);
          console.log('LangGraphAssistant: Cleaned up old agent for thread:', threadId);
        }
      }
    }
  }
}

// Initialize the assistant
new LangGraphAssistant();
