// Popup script for the browser assistant extension

document.addEventListener('DOMContentLoaded', async () => {
  // Load saved configuration
  await loadConfig();
  
  // Set up event listeners
  document.getElementById('saveConfig').addEventListener('click', saveConfig);
  document.getElementById('testConfig').addEventListener('click', testConfig);
  document.getElementById('openAssistant').addEventListener('click', openAssistant);
  document.getElementById('analyzePage').addEventListener('click', analyzePage);
});

async function loadConfig() {
  try {
    const result = await chrome.storage.sync.get(['apiKey', 'baseUrl', 'langsmithApiKey', 'langsmithProject']);
    if (result.apiKey) {
      document.getElementById('apiKey').value = result.apiKey;
    }
    if (result.baseUrl) {
      document.getElementById('baseUrl').value = result.baseUrl;
    }
    if (result.langsmithApiKey) {
      document.getElementById('langsmithApiKey').value = result.langsmithApiKey;
    }
    if (result.langsmithProject) {
      document.getElementById('langsmithProject').value = result.langsmithProject;
    }
  } catch (error) {
    console.error('Ошибка загрузки настроек:', error);
    showStatus('Ошибка загрузки настроек', 'error');
  }
}

async function saveConfig() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const baseUrl = document.getElementById('baseUrl').value.trim();
  const langsmithApiKey = document.getElementById('langsmithApiKey').value.trim();
  const langsmithProject = document.getElementById('langsmithProject').value.trim();
  
  if (!apiKey) {
    showStatus('Пожалуйста, введите API-ключ', 'error');
    return;
  }
  
  showStatus('Сохранение настроек...', 'success');
  
  try {
    // Check if Chrome runtime is available
    if (!chrome.runtime) {
      throw new Error('Chrome runtime недоступен');
    }
    
    // Send message to background script
    const response = await chrome.runtime.sendMessage({
      action: 'setApiKey',
      apiKey: apiKey,
      baseUrl: baseUrl,
      langsmithApiKey: langsmithApiKey,
      langsmithProject: langsmithProject
    });
    
    console.log('Ответ при сохранении настроек:', response);
    
    if (response && response.success) {
      showStatus('Настройки успешно сохранены!', 'success');
    } else if (response && response.error) {
      throw new Error(response.error);
    } else {
      showStatus('Настройки успешно сохранены!', 'success');
    }
  } catch (error) {
    console.error('Ошибка сохранения настроек', error);
    showStatus(`Ошибка сохранения настроек: ${error.message}`, 'error');
  }
}

async function testConfig() {
  const apiKey = document.getElementById('apiKey').value.trim();
  const baseUrl = document.getElementById('baseUrl').value.trim();
  
  if (!apiKey) {
    showStatus('Пожалуйста, сначала введите API-ключ', 'error');
    return;
  }
  
  showStatus('Проверка настроек...', 'success');
  
  try {
    // Test the API key with a simple request
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (response.ok) {
      showStatus('Проверка настроек успешна!', 'success');
    } else {
      showStatus(`Ошибка проверки настроек: ${response.status}`, 'error');
    }
  } catch (error) {
    console.error('Ошибка проверки настроек:', error);
    showStatus('Ошибка проверки настроек:' + error.message, 'error');
  }
}

async function openAssistant() {
  try {
    console.log('Popup: Открываем ассистента...');
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Popup: Текущая вкладка:', tab);
    
    // Send message to content script to toggle assistant
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'toggleAssistant' });
    console.log('Popup: Сообщение отправлено, ответ:', response);
    
    // Close the popup
    window.close();
  } catch (error) {
    console.error('Ошибка открытия асситента:', error);
    showStatus('Ошибка открытия ассистента. Убедитесь, что вы находитесь на допустимой веб-странице. Ошибка: ' + error.message, 'error');
  }
}

async function analyzePage() {
  try {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Send message to content script to analyze page
    await chrome.tabs.sendMessage(tab.id, { action: 'analyzePage' });
    
    showStatus('Анализ страницы запущен. Проверьте панель ассистента.', 'success');
  } catch (error) {
    console.error('Ошибка анализа страницы:', error);
    showStatus('Ошибка анализа страницы. Убедитесь, что вы находитесь на допустимой веб-странице.', 'error');
  }
}

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = 'block';
  
  // Hide status after 3 seconds
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}
