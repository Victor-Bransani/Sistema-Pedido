export const OrderStatus = {
    PENDING: 'pending',
    RECEIVED: 'received',
    WITH_OBSERVATIONS: 'with_observations',
    COMPLETED: 'completed',
    RETURNED: 'returned',
    READY_FOR_PICKUP: 'ready_for_pickup'
};

export const RETURN_KEYWORDS = ['devolvido', 'retorno', 'volta', 'reembolso'];

let AREAS = [
    'BIBLIOTECA',
    'SECRETARIA',
    'ENFERMAGEM',
    'ATENDIMENTO',
    'TI',
    'GERÊNCIA',
    'PATRIMONIO',
    'FUNDAÇÃO CASA',
    'DESENVOLVIMENTO SOCIAL',
    'SALA, BAR E RESTAURANTE',
    'PODOLOGIA',
    'SETOR TÉCNICO',
    'FARMACIA',
    'RADIOLOGIA',
    'PROTESE',
    'ESTETICA',
    'ADMINISTRAÇÃO E NEGÓCIOS',
    'EMED',
    'SEGURANÇA DO TRABALHO',
    'MANUTENÇÃO',
    'MODA E ARQUITETURA',
    'CULTURA E COMUNICAÇÃO',
    'BEM-ESTAR',
    'APRENDIZAGEM'
];

export function getAreas() {
    return AREAS;
}

export function setAreas(newAreas) {
    AREAS = newAreas;
}
