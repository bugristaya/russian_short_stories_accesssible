// LangGraph Agent using actual LangChain packages
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { Tool } from "@langchain/core/tools";
import { MermaidDiagramTool } from "./mermaid-tool.js";
import { Annotation, StateGraph, MessagesAnnotation, END } from "@langchain/langgraph/web";
import { Client } from "langsmith";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";

export class LangGraphAgent {
  constructor(apiKey, 
    baseUrl = 'http://localhost:8090/api/v1',
    langsmithApiKey = null,
    langsmithProject = 'browser-assistant') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.langsmithApiKey = langsmithApiKey;
    this.langsmithProject = langsmithProject;
    this.conversationHistory = [];
    this.pageContext = null;
    this.threadId = null;
    this.mermaidDiagramAgent = null;
    this.supervisor = null;
    this.initialized = false;
    this.tracer = null;
    
    // Set LangSmith environment variables immediately
    this.setLangSmithEnvironment();
  }

  // Set LangSmith environment variables
  setLangSmithEnvironment() {
    if (this.langsmithApiKey) {
      // Set environment variables for LangSmith tracing
      if (typeof process !== 'undefined') {
        process.env.LANGSMITH_TRACING = true;
        process.env.LANGSMITH_API_KEY = this.langsmithApiKey;
        process.env.LANGSMITH_PROJECT = this.langsmithProject;
        process.env.LANGSMITH_ENDPOINT = "https://api.smith.langchain.com"; 
      }
      
      // Also set in window object for browser environment
      if (typeof window !== 'undefined') {
        window.LANGSMITH_TRACING = true;
        window.LANGSMITH_API_KEY = this.langsmithApiKey;
        window.LANGSMITH_PROJECT = this.langsmithProject;
        window.LANGSMITH_ENDPOINT = "https://api.smith.langchain.com";
      }
      
      console.log('LangGraphAgent: LangSmith environment variables set');
    }
  }

  // Initialize the agent with page context
  async initialize(pageData, threadId = null) {
    try {
      console.log('LangGraphAgent: Initialize method called');
      this.pageContext = {
        url: pageData.url,
        title: pageData.title,
        content: pageData.content,
        timestamp: new Date().toISOString()
      };
      
      this.threadId = threadId || this.generateThreadId();
      console.log('LangGraphAgent: Thread ID generated:', this.threadId);
      
      // Clear previous conversation for new page
      this.conversationHistory = [];
      
      // Initialize the LangGraph agent
      console.log('LangGraphAgent: About to call setupAgent()');
      await this.setupAgent();
      console.log('LangGraphAgent: setupAgent() completed successfully');
      
      console.log('LangGraphAgent: Initialized with thread ID:', this.threadId);
      return this.threadId;
    } catch (error) {
      console.error('LangGraphAgent: Error initializing:', error);
      console.error('LangGraphAgent: Error stack:', error.stack);
      throw error;
    }
  }

  // Setup the LangGraph agent
  
async setupAgent() {
  try {
    // === 1. Проверка API ключа ===
    if (!this.apiKey) {
      throw new Error('API key is required but not provided');
    }

    // === 2. Создание LLM (GigaChat) ===
    const llm = new ChatOpenAI({
      apiKey: this.apiKey,
      model: 'GigaChat-2',
      configuration: {
        baseURL: this.baseUrl,
      },
      temperature: 0.5,
    });

    // Тест подключения
    await llm.invoke([new HumanMessage("Test")]);
    console.log('LangGraphAgent: LLM connection successful');

    // === 3. LangSmith Tracer (опционально) ===
    if (this.langsmithApiKey) {
      this.tracer = new LangChainTracer({
        projectName: this.langsmithProject,
        client: new Client({
          apiUrl: "https://api.smith.langchain.com",
          apiKey: this.langsmithApiKey,
        }),
      });
      console.log('LangGraphAgent: LangSmith tracer enabled');
    }

    // === 4. Инструмент поиска (исправленный) ===

    class SearchTool extends Tool {
      name = "search_stories";
      description = "Используй, когда нужно найти рассказы по автору, теме, году и другим критериям. Возвращает список рассказов.";

      constructor(searchApiUrl) {
        super();
        this.searchApiUrl = searchApiUrl;
      }

      async _call(input) {
        console.log('🔍 SearchTool._call called with input:', input);
        try {
          // input — это строка, например: "?filter[topics][0]=роботы&filter[yearRange][0]=1900"
          if (!input.startsWith('?')) {
            input = '?' + input;
            }
          const url = this.searchApiUrl + input;
          const response = await fetch(url, {
            method: 'GET', // Исправлено: латинская 'GET'
            headers: {
              'Content-Type': 'application/json',
            }
          });

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();
          // const stories = Array.isArray(data.results) ? data.results : [data].filter(Boolean);

          // const things = stories.rows.slice(0, 5).map(story => ({
          //     title: story.title,
          //     authorName: story.authorName || "Неизвестно",
          //     year: story.year,
          //     epoch: story.epoch,
          //     narrative: story.narrative,
          //     structure: story.structure,
          //     topics: story.topics || [],
          //     url: "https://russian-short-stories.ru/story" + "/" + story?.id
          //   }))

          return JSON.stringify(
            data,
            null,
            2
          );
        } catch (error) {
          return `Ошибка поиска рассказов: ${error.message}`;
        }
      }
    }

    const searchTool = new SearchTool('https://russian-short-stories.ru/api/story');

    // === 5. Агенты ===

    // a) Агент для суммаризации страницы
    this.summarizeAgent = createReactAgent({
      llm,
      tools: [],
      prompt: `Ты помощник, который кратко описывает содержимое веб-страницы.
      Выдели основную тему, ключевые идеи и важные детали.
      Если на странице есть форма — опиши, какие поля можно заполнить.`
    });

    // b) Агент для поиска — использует searchTool
    this.searchAgent = createReactAgent({
      llm,
      tools: [searchTool],
      prompt: `Ты помощник по поиску рассказов. Когда пользователь хочет найти рассказ:
      - Определи параметры: автор, тема, год, заголовок.
      - Сформируй строку запроса как URL-параметры.
      - Используй инструмент search_stories, передав эту строку.

      Пример:
      Пользователь: «Найди рассказы Азимова про роботов»
      → Используй: "?filter[authorName]=Азимов&filter[topics][0]=роботы"

      Пример:
      Пользователь: «Найди рассказы, написанные в 1930 году»
      → Используй: "?filter[yearRange][0]=1930&filter[yearRange][1]=1930"

      Пример:
      Пользователь: «Найди дореволюционные рассказы»
      → Используй: "?filter[yearRange][0]=1930&filter[yearRange][1]=1917"

      Пример:
      Пользователь: «Найди рассказы, нписанные в первом десятилетии XX века»
      → Используй: "?filter[yearRange][0]=1900&filter[yearRange][1]=1910"

      Если в запросе есть тема, то выбери ее из списка: 
      - БУДУЩЕЕ
      - БЫТ
      - ВЗАИМООТНОШЕНИЯ
      - ВОЙНА
      - ГОРОД
      - ДЕНЬГИ
      - ДЕТИ
      - ДОБРОДЕТЕЛЬ
      - ДОСУГ
      - ИСКУССТВО
      - КРАСОТА
      - ЛЮБОВЬ
      - МЕЧТА
      - МОЛОДЕЖЬ
      - НАСИЛИЕ
      - ПОЛИТ_БОРЬБА
      - ПОРОКИ
      - ПРИРОДА
      - ПРОГРЕСС
      - ПСИХ_СОСТОЯНИЕ
      - РЕВОЛЮЦИЯ
      - РЕЛИГИЯ
      - СВОБОДА
      - СЕМЬЯ
      - СМЕРТЬ
      - СОН
      - СОЦ_ГРУППЫ
      - СОЦ_ПРОЦЕССЫ
      - ТРУД
      - ФАНТАСТИКА
      
      Если рассказов больше 5, то напиши, сколько всего было найдено.

      Не пытайся выдумывать рассказы — всегда используй инструмент. Не повторяй контекст`
    });

    // c) Прямой ответ (если не нужен поиск или анализ)
    const directAnswerNode = async (state) => {
      const result = await llm.invoke(state.messages);
      return { messages: [result] };
    };

    // === 6. Определение состояния графа ===
    // const agentState = Annotation.Root({
    //   messages: MessagesAnnotation(),
    //   nextAction: Annotation(),
    // });

    // === 7. Построение StateGraph ===
    const builder = new StateGraph(MessagesAnnotation);

    // Узлы
    builder.addNode("summarize", this.summarizeAgent);
    builder.addNode("search", this.searchAgent);
    builder.addNode("direct", directAnswerNode);

    // === Маршрутизация через LLM ===
    const routeBasedOnIntent = async (state) => {
      const lastMessage = state.messages[state.messages.length - 1].content;

      console.log('Routing input:', lastMessage); // Отладка

      const prompt = `
Определи тип запроса. Ответь ТОЛЬКО одним словом:

- "summarize" — если нужно проанализировать текущую страницу.
- "search" — если нужно найти рассказы, авторов, темы.
- "direct" — если это приветствие, общий вопрос или непонятно.

Примеры:
"О чём эта страница?" → summarize
"Расскажи кратко" → summarize
"Найди рассказ про роботов" → search
"Где жил Чехов?" → search
"Привет!" → direct
"Как дела?" → direct

Вопрос: "${lastMessage}"
Ответ:
      `;

      try {
        const response = await llm.invoke([new HumanMessage(prompt)]);
        const decision = response.content.trim().toLowerCase();

        console.log('Routing decision:', decision);

        return ['summarize', 'search', 'direct'].includes(decision) ? decision : 'direct';
      } catch (error) {
        console.error('Routing error:', error);
        return 'direct';
      }
    };

    builder.addConditionalEdges(
      "__start__",
      routeBasedOnIntent.bind(this),
      {
        summarize: "summarize",
        search: "search",
        direct: "direct"
      }
    );

    // Все узлы завершают работу
    builder.addEdge("summarize", END);
    builder.addEdge("search", END);
    builder.addEdge("direct", END);

    // === 8. Компиляция графа ===
    this.workflow = builder.compile();
    this.supervisor = this.workflow;

    // === 9. Финализация ===
    this.initialized = true;
    console.log('LangGraphAgent: Agent setup complete with working search tool');
  } catch (error) {
    console.error('LangGraphAgent: Critical error in setupAgent:', error);
    throw error;
  }
}

  // Generate a unique thread ID for conversation persistence
  generateThreadId() {
    return 'thread_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Process a message using the LangGraph agent
  async processMessage(userMessage) {
    if (!this.initialized) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }

    try {
      // Добавляем сообщение пользователя
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
      });

      const contextualMessage = new HumanMessage(this.createContextualMessage(userMessage));

      console.log('LangGraphAgent: Invoking agent with message:', contextualMessage);

      let result;
      if (this.supervisor) {
        try {
          // Вызов: передаём состояние напрямую
          result = await this.supervisor.invoke(
            {
              messages: [contextualMessage],
            },
            {
              callbacks: this.tracer ? [this.tracer] : undefined,
            }
          );
        } catch (invokeError) {
          console.warn('LangGraphAgent: invoke failed:', invokeError);
          throw invokeError;
        }
      }

      // === Извлечение ответа ===
      let response;

      // Случай 1: result — массив сообщений (если используется MessagesAnnotation)
      if (Array.isArray(result)) {
        const lastMsg = result[result.length - 1];
        response = typeof lastMsg?.content === 'string' 
          ? lastMsg.content 
          : JSON.stringify(lastMsg?.content);
      }
      // Случай 2: result — объект с messages
      else if (result && Array.isArray(result.messages)) {
        const lastMsg = result.messages[result.messages.length - 1];
        response = typeof lastMsg?.content === 'string'
          ? lastMsg.content
          : JSON.stringify(lastMsg?.content);
      }
      // Случай 3: строка или прямой ответ
      else if (typeof result === 'string') {
        response = result;
      }
      // Случай 4: fallback — если ничего не подошло
      else {
        console.error('LangGraphAgent: Unexpected result format:', result);
        response = "Извините, я не могу обработать ответ от агента.";
      }

      console.log('LangGraphAgent: Received response:', response);

      // Сохраняем в историю
      this.conversationHistory.push({
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      });

      return response;
    } catch (error) {
      console.error('LangGraphAgent: Error processing message:', error);

      // Fallback: простой вызов LLM
      try {
        console.warn('LangGraphAgent: Falling back to direct LLM call');

        const llm = new ChatOpenAI({
          apiKey: this.apiKey,
          model: 'GigaChat-2',
          configuration: { baseURL: this.baseUrl },
          temperature: 0.5,
        });

        const contextualMessage = this.createContextualMessage(userMessage);
        const llmResult = await llm.invoke([new HumanMessage(contextualMessage)]);
        const response = llmResult.content;

        this.conversationHistory.push({
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
        });

        return response;
      } catch (fallbackError) {
        console.error('LangGraphAgent: Fallback failed:', fallbackError);
        const errorMsg = "Не удалось получить ответ от агента.";
        this.conversationHistory.push({
          role: 'assistant',
          content: errorMsg,
          timestamp: new Date().toISOString(),
        });
        return errorMsg;
      }
    }
  }

  // Create a contextual message that includes page information
  createContextualMessage(userMessage) {
    return `Ты помощник по сайту. The user is currently on this webpage:

URL: ${this.pageContext.url}
Title: ${this.pageContext.title}
Content: ${this.pageContext.content}

User's question: ${userMessage}

Please provide a helpful response based on the webpage content and the user's question. 
If the question is not related to the current page, you can still help but mention that 
you're not sure about the current page context.

Previous conversation:
${this.conversationHistory.map(h => `${h.role}: ${h.content}`).join('\n')}`;
  }

  // Get conversation history
  getConversationHistory() {
    return this.conversationHistory;
  }

  // Get current thread ID
  getThreadId() {
    return this.threadId;
  }

  // Clear conversation history
  clearHistory() {
    this.conversationHistory = [];
    console.log('LangGraphAgent: Conversation history cleared');
  }

  // Export conversation for analysis
  exportConversation() {
    return {
      threadId: this.threadId,
      pageContext: this.pageContext,
      conversationHistory: this.conversationHistory,
      exportDate: new Date().toISOString()
    };
  }

  // Get agent status
  getStatus() {
    return {
      isInitialized: this.initialized,
      threadId: this.threadId,
      messageCount: this.conversationHistory.length,
      lastActivity: this.conversationHistory.length > 0 ? 
        this.conversationHistory[this.conversationHistory.length - 1].timestamp : null
    };
  }
}
