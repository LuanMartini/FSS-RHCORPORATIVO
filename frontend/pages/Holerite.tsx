interface Funcionario {
  nome: string;
  salario?: number;
}

export default function Holerite({ funcionario }: { funcionario: Funcionario }) {
  const salario = funcionario.salario || 0;
  const desconto = salario * 0.1;
  const liquido = salario - desconto;

  return (
    <div>
      <h2>Holerite</h2>

      <p><strong>Nome:</strong> {funcionario.nome}</p>
      <p><strong>Salário Bruto:</strong> R$ {salario}</p>
      <p><strong>Desconto (10%):</strong> R$ {desconto}</p>
      <p><strong>Salário Líquido:</strong> R$ {liquido}</p>
    </div>
  );
}