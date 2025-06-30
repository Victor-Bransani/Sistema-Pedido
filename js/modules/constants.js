// modules/constants.js

// Status possíveis para um pedido
export const OrderStatus = Object.freeze({
    PENDING: 'pending',                 // Pedido recém-criado, aguardando processamento/recebimento
    RECEIVED: 'received',               // Pedido recebido fisicamente, sem observações
    WITH_OBSERVATIONS: 'with_observations', // Pedido recebido, mas com observações (ex: itens faltando, danificados)
    READY_FOR_PICKUP: 'ready_for_pickup', // Pedido processado e pronto para ser retirado pelo requisitante
    COMPLETED: 'completed',             // Pedido retirado e finalizado
    RETURNED: 'returned',               // Pedido devolvido ao fornecedor
});

// Palavras-chave para identificar pedidos devolvidos em observações
export const RETURN_KEYWORDS = Object.freeze([
    'devolvido', 'retorno', 'volta', 'reembolso', 'devolucao', 'devolução',
    'nao conforme', 'não conforme', 'avaria', 'avariado' // Adicionando variações e termos comuns
]);

// Lista de áreas padrão do sistema
export const DEFAULT_AREAS = Object.freeze([
    'ADMINISTRACAO E NEGOCIOS', 'APRENDIZAGEM', 'ATENDIMENTO', 'BEM-ESTAR',
    'BIBLIOTECA', 'CULTURA E COMUNICACAO', 'DESENVOLVIMENTO SOCIAL', 'EMED',
    'ENFERMAGEM', 'ESTETICA', 'FARMACIA', 'FUNDACAO CASA', 'GERENCIA',
    'MANUTENCAO', 'MODA E ARQUITETURA', 'PATRIMONIO', 'PODOLOGIA', 'PROTESE',
    'RADIOLOGIA', 'SALA, BAR E RESTAURANTE', 'SECRETARIA',
    'SEGURANCA DO TRABALHO', 'SETOR TECNICO', 'TI',
]);

// Papéis (Roles) de usuário no sistema
export const UserRoles = Object.freeze({
    ADMIN: 'admin',     // Acesso total, configurações, gerenciamento de usuários
    USER: 'user',       // Usuário padrão (pode ser Comprador/Requisitante)
    RECEIVER: 'receiver', // Perfil focado no recebimento físico dos pedidos
    // PICKUP: 'pickup' // Se houver um perfil dedicado apenas para a ação de retirada
});

// Chaves utilizadas para armazenar dados no localStorage
// Adicionar um sufixo de versão (ex: _v1) é uma boa prática para facilitar futuras migrações de dados.
export const STORAGE_KEYS = Object.freeze({
    USERS: 'app_users_v1',
    ORDERS: 'app_orders_v1',
    AREAS: 'app_areas_v1',
    WITHDRAWERS: 'app_withdrawers_v1',
    CURRENT_USER: 'app_currentUser_v1',
    TEMP_ORDER: 'app_tempOrder_v1', // Para pedidos em processamento antes de salvar área
});

// Configurações gerais da aplicação
export const APP_CONFIG = Object.freeze({
    NOTIFICATION_TIMEOUT: 3500,     // Tempo em milissegundos para notificações desaparecerem
    DEBOUNCE_SEARCH_TIMEOUT: 300,   // Tempo em milissegundos para debounce em campos de busca
    PASSWORD_MIN_LENGTH: 6,         // Comprimento mínimo para senhas de usuário
});
