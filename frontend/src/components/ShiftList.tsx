import type { Shift } from '../types';

interface ShiftListProps {
  shifts: Shift[];
}

export function ShiftList({ shifts }: ShiftListProps) {
  if (shifts.length === 0) {
    return <p>Nenhum plantão encontrado.</p>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
          <th style={{ padding: 8 }}>Título</th>
          <th style={{ padding: 8 }}>Data</th>
          <th style={{ padding: 8 }}>Início</th>
          <th style={{ padding: 8 }}>Fim</th>
        </tr>
      </thead>
      <tbody>
        {shifts.map((shift) => (
          <tr key={shift.id} style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: 8 }}>{shift.title}</td>
            <td style={{ padding: 8 }}>{shift.date}</td>
            <td style={{ padding: 8 }}>{shift.startTime}</td>
            <td style={{ padding: 8 }}>{shift.endTime}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
