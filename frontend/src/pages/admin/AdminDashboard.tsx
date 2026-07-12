import { useAuth } from '../../hooks/useAuth';
import styles from './AdminDashboard.module.css';

interface Props {
  onNavigate: (screen: string) => void;
}

export function AdminDashboard({ onNavigate }: Props) {
  const { user } = useAuth();
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;

  const displayName = user?.name ?? user?.email ?? 'Admin';

  return (
    <>
      {/* ── WELCOME HERO ── */}
      <div className={styles.hero}>
        <div className={styles.heroMesh} />
        <div className={styles.heroInner}>
          <div className={styles.heroGreeting}>Bem-vinda de volta</div>
          <div className={styles.heroName}>{displayName}</div>
          <div className={styles.heroEmail}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
            {user?.email}
          </div>
          <div className={styles.heroTags}>
            <span className={styles.heroTag}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
              Administradora da OS
            </span>
            <span className={styles.heroTag}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              {timeStr}
            </span>
          </div>
        </div>
      </div>

      {/* ── KPI STRIP ── */}
      <div className={styles.kpiStrip}>
        <div className={`${styles.kpi} ${styles.kpiIndigo}`}>
          <div className={styles.kpiLabel}>Contratos ativos</div>
          <div className={styles.kpiValue}>2</div>
          <div className={styles.kpiSub}>prefeituras atendidas</div>
        </div>
        <div className={`${styles.kpi} ${styles.kpiTeal}`}>
          <div className={styles.kpiLabel}>Médicos cadastrados</div>
          <div className={styles.kpiValue}>14</div>
          <div className={styles.kpiSub}>com biometria ativa</div>
        </div>
        <div className={`${styles.kpi} ${styles.kpiGreen}`}>
          <div className={styles.kpiLabel}>Plantões hoje</div>
          <div className={styles.kpiValue}>11</div>
          <div className={styles.kpiSub}>de 14 confirmados</div>
        </div>
        <div className={`${styles.kpi} ${styles.kpiYellow}`}>
          <div className={styles.kpiLabel}>Alertas pendentes</div>
          <div className={styles.kpiValue}>3</div>
          <div className={styles.kpiSub}>requerem atenção</div>
        </div>
      </div>

      {/* ── GRID: Quick Actions + Alerts ── */}
      <div className={styles.homeGrid}>
        <div>
          <h3 className={styles.sectionTitle}>Acesso rápido</h3>
          <div className={styles.actionsGrid}>
            <button className={styles.actionCard} onClick={() => onNavigate('professionals')} type="button">
              <div className={`${styles.actionIcon} ${styles.actionIconIndigo}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /><path d="M12 11v4" /><path d="M9 14h6" /></svg>
              </div>
              <div className={styles.actionName}>Médicos</div>
              <div className={styles.actionDesc}>Cadastrar e gerenciar médicos e biometria facial.</div>
            </button>
            <button className={styles.actionCard} onClick={() => onNavigate('shifts')} type="button">
              <div className={`${styles.actionIcon} ${styles.actionIconTeal}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              </div>
              <div className={styles.actionName}>Escalas</div>
              <div className={styles.actionDesc}>Criar e editar escalas de plantão por UPA e turno.</div>
            </button>
            <button className={styles.actionCard} onClick={() => onNavigate('realtime')} type="button">
              <div className={`${styles.actionIcon} ${styles.actionIconGreen}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
              </div>
              <div className={styles.actionName}>Tempo Real</div>
              <div className={styles.actionDesc}>Acompanhar check-ins e status das UPAs agora.</div>
            </button>
            <button className={styles.actionCard} onClick={() => onNavigate('substitutions')} type="button">
              <div className={`${styles.actionIcon} ${styles.actionIconYellow}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
              </div>
              <div className={styles.actionName}>Substituições</div>
              <div className={styles.actionDesc}>Gerenciar trocas e reposições de plantões.</div>
            </button>
            <button className={styles.actionCard} onClick={() => onNavigate('entities')} type="button">
              <div className={`${styles.actionIcon} ${styles.actionIconPurple}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
              </div>
              <div className={styles.actionName}>Órgãos Públicos</div>
              <div className={styles.actionDesc}>Gerir contratos e acessos das prefeituras.</div>
            </button>
            <button className={styles.actionCard} onClick={() => onNavigate('reports')} type="button">
              <div className={`${styles.actionIcon} ${styles.actionIconRed}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </div>
              <div className={styles.actionName}>Relatórios</div>
              <div className={styles.actionDesc}>KPIs, faturamento e relatórios para a prefeitura.</div>
            </button>
          </div>
        </div>

        {/* ALERTS */}
        <div>
          <h3 className={styles.sectionTitle}>Alertas e atividades</h3>
          <div className={styles.alertsCard}>
            <div className={styles.alertsHeader}>
              <span className={styles.alertsTitle}>Central de alertas</span>
              <span className={styles.alertsBadge}>3 pendentes</span>
            </div>
            <div className={styles.alertList}>
              <AlertItem color="red" text="Turno da noite descoberto — UPA Centro" sub="Nenhum médico escalado para 19h–07h de amanhã" time="Agora" />
              <AlertItem color="yellow" text="Dra. Renata Silva — 7 ausências em maio" sub="Limite de tolerância contratual atingido" time="08:45" />
              <AlertItem color="yellow" text="Acionamento da Prefeitura pendente" sub="Ausência sem resposta" time="Ontem" />
              <AlertItem color="green" text="Escala de junho publicada — UPA Vila Pereira" sub="14 médicos confirmados para os 30 dias" time="Ontem" />
              <AlertItem color="indigo" text="Novo gestor adicionado — Prefeitura Central" sub="Dr. Valmir Sousa agora tem acesso ao painel" time="24/05" />
              <AlertItem color="green" text="Biometria cadastrada — Dr. Lucas Prado" sub="Acesso ao sistema liberado com sucesso" time="23/05" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function AlertItem({ color, text, sub, time }: { color: string; text: string; sub: string; time: string }) {
  return (
    <div className={styles.alertItem}>
      <div className={`${styles.alertDot} ${styles[`alertDot_${color}`]}`} />
      <div className={styles.alertBody}>
        <div className={styles.alertText}>{text}</div>
        <div className={styles.alertSub}>{sub}</div>
      </div>
      <div className={styles.alertTime}>{time}</div>
    </div>
  );
}
