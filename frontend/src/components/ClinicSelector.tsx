import { useClinic } from '../hooks/useClinic';

export function ClinicSelector() {
  const { clinics, activeClinic, setActiveClinic, loading } = useClinic();

  if (loading) {
    return <span>Carregando clínicas...</span>;
  }

  if (clinics.length === 0) {
    return <span>Nenhuma clínica disponível</span>;
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = clinics.find((c) => c.id === e.target.value);
    if (selected) {
      setActiveClinic(selected);
    }
  };

  return (
    <select
      value={activeClinic?.id ?? ''}
      onChange={handleChange}
      aria-label="Selecionar clínica ativa"
      style={{ padding: '4px 8px' }}
    >
      {clinics.map((clinic) => (
        <option key={clinic.id} value={clinic.id}>
          {clinic.name}
        </option>
      ))}
    </select>
  );
}
