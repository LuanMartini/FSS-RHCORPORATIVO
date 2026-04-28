import { useState } from "react";

export default function AdmitirFuncionario() {
  const [form, setForm] = useState({
    nome: "",
    cargo: "",
    departamento: "",
    salario: "",
    cpf: ""
  });

  function handleChange(e: any) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function handleSubmit(e: any) {
    e.preventDefault();
    console.log("Novo funcionário:", form);
  }

  return (
    <div>
      <h2>Admitir Funcionário</h2>

      <form onSubmit={handleSubmit}>
        <input name="nome" placeholder="Nome" onChange={handleChange} />
        <input name="cargo" placeholder="Cargo" onChange={handleChange} />
        <input name="departamento" placeholder="Departamento" onChange={handleChange} />
        <input name="salario" placeholder="Salário" type="number" onChange={handleChange} />
        <input name="cpf" placeholder="CPF" onChange={handleChange} />

        <button type="submit">Cadastrar</button>
      </form>
    </div>
  );
}