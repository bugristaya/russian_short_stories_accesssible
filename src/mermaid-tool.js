// Mermaid diagram tool for LangGraph agent
import { Tool } from "@langchain/core/tools";

export class MermaidDiagramTool extends Tool {
  constructor() {
    super();
    this.name = "mermaid_diagram";
    this.description = "Создает диаграмму Mermaid из кода. Используйте этот инструмент, когда пользователи просят диаграммы, блок-схемы, диаграммы последовательности, диаграммы классов или любые визуальные представления. На входе должен быть код диаграммы Mermaid.";
    this.mermaidLoaded = false;
  }

  async _call(input) {
    try {
      // Validate that the input looks like Mermaid code
      const mermaidCode = input.trim();
      
      if (!mermaidCode) {
        return "Ошибка: код Mermaid не предоставлен. Пожалуйста, укажите корректный код диаграммы Mermaid.";
      }

      // Basic validation for Mermaid syntax
      const validMermaidTypes = [
        'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 
        'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'gitgraph'
      ];
      
      const hasValidType = validMermaidTypes.some(type => 
        mermaidCode.toLowerCase().includes(type.toLowerCase())
      );
      
      if (!hasValidType) {
        return `Ошибка: неверный синтаксис Mermaid. Пожалуйста, начните с одного из следующих типов диаграмм:  ${validMermaidTypes.join(', ')}`;
      }

      // Create a unique ID for the diagram
      const diagramId = `mermaid-id`;
      
      // Return HTML that uses external script for rendering
      const mermaidHtml = `
      <head>  
        <script src="src/mermaid-render.js"></script>  <!-- Adjust path as needed -->
      </head>
        <div class="mermaid-diagram" id="${diagramId}" data-diagram-id="${diagramId}" data-mermaid-code="${mermaidCode.replace(/"/g, '&quot;')}">
          <div class="mermaid-code">
            <pre><code>${mermaidCode}</code></pre>
          </div>
          <div class="mermaid-container">
            <div class="mermaid" id="${diagramId}-render">${mermaidCode}</div>
          </div>
        </div>
        <script>
          // Call the external render function
          console.log('Попытка вызвать renderMermaidDiagram...');
          console.log('Тип renderMermaidDiagram:', typeof renderMermaidDiagram);
          console.log('Тип window.renderMermaidDiagram:', typeof window.renderMermaidDiagram);
          
          if (typeof renderMermaidDiagram === 'function') {
            console.log('Вызов renderMermaidDiagram напрямую');
            renderMermaidDiagram('${diagramId}', \`${mermaidCode}\`);
          } else if (typeof window.renderMermaidDiagram === 'function') {
            console.log('Вызов window.renderMermaidDiagram');
            window.renderMermaidDiagram('${diagramId}', \`${mermaidCode}\`);
          } else {
            console.error('Функция renderMermaidDiagram не найдена');
            console.log('Доступные свойства window:', Object.keys(window).filter(key => key.includes('render')));
          }
        </script>
      `;
      console.log('MermaidDiagramTool: Mermaid HTML created successfully');
      console.log('MermaidDiagramTool: Mermaid HTML:', mermaidHtml);
      return mermaidHtml;
      
    } catch (error) {
      console.error('Ошибка MermaidDiagramTool:', error);
      return `Ошибка при создании диаграммы Mermaid: ${error.message}`;
    }
  }
}

