import { Page } from "../App";

interface Props {
  page: Page;
  setPage: (p: Page) => void;
}

const navItems: { key: Page; icon: string; label: string }[] = [
  { key: "dashboard",    icon: "⊞",  label: "Dashboard" },
  { key: "funcionarios", icon: "👥", label: "Funcionários" },
  { key: "admitir",      icon: "＋", label: "Admitir Funcionário" },
  { key: "ponto",        icon: "⏱", label: "Registrar Ponto" },
  { key: "holerite",     icon: "📄", label: "Holerite" },
];

export default function Sidebar({ page, setPage }: Props) {
  return (
    <aside style={styles.sidebar}>
      <h2 style={styles.title}>RH Corporativo</h2>

      <nav>
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setPage(item.key)}
            style={{
              ...styles.button,
              ...(page === item.key ? styles.active : {}),
            }}
          >
            <span style={styles.icon}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  sidebar: {
    width: "220px",
    height: "100vh",
    background: "#1e1e2f",
    color: "#fff",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
  },

  title: {
    marginBottom: "20px",
  },

  button: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    width: "100%",
    padding: "10px",
    marginBottom: "10px",
    background: "transparent",
    border: "none",
    color: "#fff",
    cursor: "pointer",
    textAlign: "left",
    borderRadius: "8px",
  },

  active: {
    background: "#34345a",
  },

  icon: {
    fontSize: "18px",
  },
};