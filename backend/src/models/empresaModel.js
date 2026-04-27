// src/models/empresaModel.js
export class Departamento {
    constructor(id, nome, sigla, gestorId) {
        this.id = id;
        this.nome = nome;
        this.sigla = sigla;
        this.gestorId = gestorId; // ID do funcionário que manda no setor
    }
}

export class Cargo {
    constructor(id, nome, departamentoId, salarioBase) {
        this.id = id;
        this.nome = nome;
        this.departamentoId = departamentoId;
        this.salarioBase = salarioBase;
    }
}