import type { CSSProperties } from "react";
import type { Page } from "../types/page";

interface Props {
  page: Page;
  setPage: (p: Page) => void;
}

const navItems: { key: Page; label: string }[] = [
  { key: "dashboard",     label: "Dashboard" },
  { key: "funcionarios",  label: "Funcionários" },
  { key: "admitir",       label: "Admitir" },
  { key: "ponto",         label: "Ponto" },
  { key: "holerite",      label: "Holerite" },
  { key: "folha",         label: "Folha do mês" },
  { key: "ferias",        label: "Férias" },
  { key: "beneficios",    label: "Benefícios" },
  { key: "treinamentos",  label: "Treinamentos" },
  { key: "advertencias",  label: "Advertências" },
];

export default function Sidebar({ page, setPage }: Props) {
  return (
    <aside style={styles.sidebar}>
      <h2 style={styles.title}>RH Corporativo</h2>

      <nav>
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPage(item.key)}
            style={{
              ...styles.button,
              ...(page === item.key ? styles.active : {}),
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

const styles: Record<string, CSSProperties> = {
  sidebar: {
    width: "220px",
    height: "100vh",
    background: "#1e1e2f",
    color: "#fff",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    position: "fixed",
    left: 0,
    top: 0,
    overflowY: "auto",
  },

  title: {
    marginBottom: "20px",
  },

  button: {
    display: "block",
    width: "100%",
    padding: "10px",
    marginBottom: "8px",
    background: "transparent",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    textAlign: "left",
    borderRadius: "8px",
    fontSize: "14px",
  },

  active: {
    background: "#34345a",
  },
};
