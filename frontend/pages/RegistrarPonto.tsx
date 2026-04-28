import { useState } from "react";

export default function RegistrarPonto() {
  const [registro, setRegistro] = useState({
    funcionario: "",
    horario: ""
  });

  function handleChange(e: any) {
    setRegistro({ ...registro, [e.target.name]: e.target.value });
  }

  function handleSubmit(e: any) {
    e.preventDefault();
    console.log("Ponto registrado:", registro);
  }

  return (
    <div>
      <h2>Registrar Ponto</h2>

      <form onSubmit={handleSubmit}>
        <input name="funcionario" placeholder="Nome do funcionário" onChange={handleChange} />
        <input name="horario" type="datetime-local" onChange={handleChange} />

        <button type="submit">Registrar</button>
      </form>
    </div>
  );
}