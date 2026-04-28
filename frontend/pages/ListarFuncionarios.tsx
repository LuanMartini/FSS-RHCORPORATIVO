interface Funcionario {
  id?: string;
  nome: string;
  cargo?: string;
  departamento?: string;
  salario?: number;
  cpf?: string;
}

interface Props {
  funcionarios: Funcionario[];
}

export default function ListarFuncionarios({ funcionarios }: Props) {
  return (
    <div>
      <h2>Funcionários</h2>

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Cargo</th>
            <th>Departamento</th>
            <th>Salário</th>
            <th>CPF</th>
          </tr>
        </thead>

        <tbody>
          {funcionarios.map((f) => (
            <tr key={f.id}>
              <td>{f.nome}</td>
              <td>{f.cargo}</td>
              <td>{f.departamento}</td>
              <td>{f.salario}</td>
              <td>{f.cpf}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}