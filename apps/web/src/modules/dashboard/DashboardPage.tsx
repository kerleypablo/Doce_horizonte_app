import { Link } from 'react-router-dom';

const cards = [
  {
    title: 'Insumos',
    description: 'Cadastre materias-primas, embalagem e custos unitarios.',
    path: '/app/insumos'
  },
  {
    title: 'Receitas',
    description: 'Monte receitas com rendimento e consumo de insumos.',
    path: '/app/receitas'
  },
  {
    title: 'Produtos',
    description: 'Precifique produtos com margem, taxas e canais.',
    path: '/app/produtos'
  },
  {
    title: 'Empresa',
    description: 'Gastos fixos, taxas e configuracoes gerais.',
    path: '/app/empresa'
  }
];

export const DashboardPage = () => {
  return (
    <div className="grid">
      {cards.map((card) => (
        <Link key={card.title} to={card.path} className="card">
          <h3>{card.title}</h3>
          <p>{card.description}</p>
        </Link>
      ))}
    </div>
  );
};
