// error-handler.js
// Sistema de captura e exibição de erros para administradores

// Configurações
const errorHandlerConfig = {
    enabled: true,                 // Ativar/desativar completamente
    logToConsole: true,            // Exibir erros no console
    showVisualIndicator: true,     // Mostrar botão/indicador visual
    maxErrors: 50,                 // Número máximo de erros a manter no histórico
    hiddenByDefault: true,         // O painel de erros começa oculto
    autoHideDelay: 10000,          // Ocultar painel automaticamente após X ms (0 para desativar)
    showChartJsErrors: false,      // Filtrar erros do Chart.js (comuns e menos relevantes)
    showNetworkErrors: true,       // Capturar e exibir erros de rede
    errorIconColor: '#dc3545',     // Cor do ícone de erro (vermelho)
    warningIconColor: '#ffc107',   // Cor do ícone de aviso (amarelo)
};

class ErrorHandler {
    constructor(config = {}) {
        this.config = { ...errorHandlerConfig, ...config };
        this.errors = [];
        this.errorCount = 0;
        this.warningCount = 0;
        this.initialized = false;
        this.container = null;
        this.toggle = null;
    }

    // Inicialização e criação dos elementos da UI
    init() {
        if (!this.config.enabled || this.initialized) return;
        
        this.createUI();
        this.attachEventListeners();
        
        // Captura erros não tratados
        window.addEventListener('error', this.handleError.bind(this));
        
        // Captura promessas rejeitadas não tratadas
        window.addEventListener('unhandledrejection', this.handleRejection.bind(this));
        
        // Sobrescreve console.error
        this.originalConsoleError = console.error;
        console.error = (...args) => {
            this.captureConsoleError(...args);
            this.originalConsoleError.apply(console, args);
        };
        
        // Sobrescreve console.warn
        this.originalConsoleWarn = console.warn;
        console.warn = (...args) => {
            this.captureConsoleWarning(...args);
            this.originalConsoleWarn.apply(console, args);
        };
        
        this.initialized = true;
        console.log('[ErrorHandler] Inicializado com sucesso.');
    }
    
    // Criar os elementos visuais
    createUI() {
        // Criar container de erros
        this.container = document.createElement('div');
        this.container.id = 'error-container';
        this.container.style.cssText = `
            position: fixed;
            bottom: 50px;
            right: 10px;
            width: 400px;
            max-height: 60vh;
            background-color: rgba(33, 37, 41, 0.95);
            color: white;
            border-radius: 6px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
            z-index: 9999;
            overflow-y: auto;
            font-family: monospace;
            font-size: 12px;
            display: ${this.config.hiddenByDefault ? 'none' : 'block'};
            transition: all 0.3s ease;
        `;
        
        // Barra superior com título e controles
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 8px 12px;
            background-color: rgba(0, 0, 0, 0.2);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        `;
        header.innerHTML = `
            <span style="font-weight: bold;">Console de Erros</span>
            <div class="error-controls">
                <button id="clear-errors" style="background: none; border: none; color: white; cursor: pointer; margin-right: 5px; font-size: 12px;">Limpar</button>
                <button id="close-errors" style="background: none; border: none; color: white; cursor: pointer; font-size: 16px;">&times;</button>
            </div>
        `;
        this.container.appendChild(header);
        
        // Área de conteúdo para os erros
        this.errorContent = document.createElement('div');
        this.errorContent.style.cssText = `
            padding: 10px;
        `;
        this.container.appendChild(this.errorContent);
        
        // Botão de toggle flutuante
        this.toggle = document.createElement('button');
        this.toggle.id = 'error-toggle';
        this.toggle.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 36px;
            height: 36px;
            background-color: ${this.config.errorIconColor};
            color: white;
            border-radius: 50%;
            border: none;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            z-index: 10000;
            opacity: 0.8;
            transition: all 0.3s ease;
            display: ${this.config.showVisualIndicator ? 'flex' : 'none'};
        `;
        this.toggle.textContent = '0';
        this.toggle.title = 'Mostrar erros capturados';
        
        // Adicionar os elementos ao DOM
        document.body.appendChild(this.container);
        document.body.appendChild(this.toggle);
    }
    
    // Anexar event listeners aos controles
    attachEventListeners() {
        // Toggle para abrir/fechar
        this.toggle.addEventListener('click', () => {
            this.container.style.display = this.container.style.display === 'none' ? 'block' : 'none';
        });
        
        // Botão para fechar
        document.getElementById('close-errors').addEventListener('click', () => {
            this.container.style.display = 'none';
        });
        
        // Botão para limpar
        document.getElementById('clear-errors').addEventListener('click', () => {
            this.errors = [];
            this.errorCount = 0;
            this.warningCount = 0;
            this.errorContent.innerHTML = '';
            this.updateToggleCount();
        });
    }
    
    // Lidar com erros não tratados
    handleError(event) {
        // Verificar se é um erro do Chart.js para filtrar se necessário
        if (!this.config.showChartJsErrors && 
            event.message && 
            event.message.includes('Chart with ID')) {
            return;
        }
        
        const errorInfo = {
            type: 'error',
            message: event.message,
            source: event.filename,
            line: event.lineno,
            column: event.colno,
            timestamp: new Date(),
            stack: event.error ? event.error.stack : null
        };
        
        this.addError(errorInfo);
        
        // Certos erros podem exigir ação imediata, como recarregar recursos
        this.handleSpecialErrors(errorInfo);
    }
    
    // Lidar com rejeições de promessas não tratadas
    handleRejection(event) {
        const errorInfo = {
            type: 'promise-rejection',
            message: event.reason.message || String(event.reason),
            timestamp: new Date(),
            stack: event.reason.stack,
            reason: event.reason
        };
        
        this.addError(errorInfo);
    }
    
    // Capturar erros do console.error
    captureConsoleError(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        
        const errorInfo = {
            type: 'console-error',
            message: message,
            timestamp: new Date(),
            args: args
        };
        
        this.addError(errorInfo);
    }
    
    // Capturar avisos do console.warn
    captureConsoleWarning(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        
        const errorInfo = {
            type: 'warning',
            message: message,
            timestamp: new Date(),
            args: args
        };
        
        this.addWarning(errorInfo);
    }
    
    // Adicionar erro à lista e UI
    addError(errorInfo) {
        if (!this.config.enabled || !this.initialized) return;
        
        // Limitar o número de erros para evitar consumo excessivo de memória
        if (this.errors.length >= this.config.maxErrors) {
            this.errors.shift(); // Remove o erro mais antigo
        }
        
        this.errors.push(errorInfo);
        this.errorCount++;
        
        this.renderError(errorInfo);
        this.updateToggleCount();
    }
    
    // Adicionar aviso à lista e UI
    addWarning(warningInfo) {
        if (!this.config.enabled || !this.initialized) return;
        
        // Limitar o número de avisos
        if (this.errors.length >= this.config.maxErrors) {
            this.errors.shift();
        }
        
        this.errors.push(warningInfo);
        this.warningCount++;
        
        this.renderWarning(warningInfo);
        this.updateToggleCount();
    }
    
    // Renderizar erro na UI
    renderError(errorInfo) {
        if (!this.errorContent) return;
        
        const errorElement = document.createElement('div');
        errorElement.className = 'error-item';
        errorElement.style.cssText = `
            padding: 8px;
            margin-bottom: 8px;
            border-left: 3px solid ${this.config.errorIconColor};
            background-color: rgba(220, 53, 69, 0.1);
            word-break: break-word;
        `;
        
        // Formatar a hora como HH:MM:SS
        const time = errorInfo.timestamp.toTimeString().split(' ')[0];
        
        let errorContent = `
            <div style="color: rgba(255,255,255,0.7); font-size: 10px;">[${time}] ${errorInfo.type.toUpperCase()}</div>
            <div style="margin-top: 5px; color: white;">${errorInfo.message}</div>
        `;
        
        // Adicionar informações específicas por tipo de erro
        if (errorInfo.source) {
            errorContent += `<div style="margin-top: 5px; color: rgba(255,255,255,0.6); font-size: 10px;">Em ${errorInfo.source}:${errorInfo.line}:${errorInfo.column}</div>`;
        }
        
        if (errorInfo.stack) {
            errorContent += `
                <div style="margin-top: 5px;">
                    <button class="toggle-stack" style="background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; padding: 0; text-decoration: underline; font-size: 10px;">Ver stack trace</button>
                    <pre class="stack-trace" style="display: none; margin-top: 5px; color: rgba(255,255,255,0.6); font-size: 10px; white-space: pre-wrap;">${errorInfo.stack}</pre>
                </div>
            `;
        }
        
        errorElement.innerHTML = errorContent;
        this.errorContent.appendChild(errorElement);
        
        // Event listener para expandir/colapsar stack trace
        const toggleButton = errorElement.querySelector('.toggle-stack');
        if (toggleButton) {
            toggleButton.addEventListener('click', () => {
                const stackTrace = errorElement.querySelector('.stack-trace');
                if (stackTrace) {
                    const isHidden = stackTrace.style.display === 'none';
                    stackTrace.style.display = isHidden ? 'block' : 'none';
                    toggleButton.textContent = isHidden ? 'Ocultar stack trace' : 'Ver stack trace';
                }
            });
        }
        
        // Rolar para o final da lista
        this.errorContent.scrollTop = this.errorContent.scrollHeight;
        
        // Auto-ocultar o painel após um tempo, se configurado
        if (this.config.autoHideDelay > 0) {
            this.container.style.display = 'block'; // Mostrar o container primeiro
            clearTimeout(this.autoHideTimeout);
            this.autoHideTimeout = setTimeout(() => {
                this.container.style.display = 'none';
            }, this.config.autoHideDelay);
        }
    }
    
    // Renderizar aviso na UI
    renderWarning(warningInfo) {
        if (!this.errorContent) return;
        
        const warningElement = document.createElement('div');
        warningElement.className = 'warning-item';
        warningElement.style.cssText = `
            padding: 8px;
            margin-bottom: 8px;
            border-left: 3px solid ${this.config.warningIconColor};
            background-color: rgba(255, 193, 7, 0.1);
            word-break: break-word;
        `;
        
        // Formatar a hora como HH:MM:SS
        const time = warningInfo.timestamp.toTimeString().split(' ')[0];
        
        warningElement.innerHTML = `
            <div style="color: rgba(255,255,255,0.7); font-size: 10px;">[${time}] AVISO</div>
            <div style="margin-top: 5px; color: white;">${warningInfo.message}</div>
        `;
        
        this.errorContent.appendChild(warningElement);
        
        // Rolar para o final da lista
        this.errorContent.scrollTop = this.errorContent.scrollHeight;
    }
    
    // Atualizar o contador no botão de toggle
    updateToggleCount() {
        if (!this.toggle) return;
        
        const totalCount = this.errorCount + this.warningCount;
        this.toggle.textContent = totalCount;
        
        // Atualizar visibilidade do toggle baseado na contagem
        if (this.config.showVisualIndicator) {
            this.toggle.style.display = totalCount > 0 ? 'flex' : 'none';
        }
        
        // Atualizar cor do ícone baseado no tipo de problema mais grave
        if (this.errorCount > 0) {
            this.toggle.style.backgroundColor = this.config.errorIconColor;
        } else if (this.warningCount > 0) {
            this.toggle.style.backgroundColor = this.config.warningIconColor;
        }
        
        // Tornar o botão mais opaco quando há mais erros
        if (totalCount > 9) {
            this.toggle.style.opacity = '1';
        } else {
            this.toggle.style.opacity = '0.8';
        }
    }
    
    // Lidar com erros específicos que exigem ações especiais
    handleSpecialErrors(errorInfo) {
        // Verificar se é o erro específico do Chart.js sobre canvas já em uso
        if (errorInfo.message && 
            errorInfo.message.includes('Canvas is already in use') && 
            errorInfo.message.includes('Chart with ID') && 
            errorInfo.message.includes('must be destroyed')) {
            
            console.log('[ErrorHandler] Detectou erro do Chart.js, tentando recuperar...');
            
            // Verificar se o canvas existe
            const canvasId = errorInfo.message.match(/canvas with ID '([^']+)'/)?.[1] || 'statusChart';
            const canvas = document.getElementById(canvasId);
            
            if (canvas) {
                // Remover e recriar o canvas para limpar completamente
                const parent = canvas.parentNode;
                if (parent) {
                    // Armazenar atributos originais
                    const width = canvas.width;
                    const height = canvas.height;
                    
                    // Remover canvas antigo
                    parent.removeChild(canvas);
                    
                    // Criar novo canvas com mesmos atributos
                    const newCanvas = document.createElement('canvas');
                    newCanvas.id = canvasId;
                    newCanvas.width = width;
                    newCanvas.height = height;
                    
                    // Adicionar ao DOM
                    parent.appendChild(newCanvas);
                    
                    // Limpar instâncias armazenadas
                    if (window.chartInstances) {
                        window.chartInstances[canvasId] = null;
                    }
                    
                    console.log(`[ErrorHandler] Canvas ${canvasId} recriado com sucesso.`);
                }
            }
        }
    }
}

// Criar e inicializar o handler de erros
const errorHandler = new ErrorHandler();

// Inicializar depois que o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    errorHandler.init();
});

// Disponibilizar globalmente
window.errorHandler = errorHandler; 

// Não há exports aqui - este arquivo é carregado diretamente pelo script tag 