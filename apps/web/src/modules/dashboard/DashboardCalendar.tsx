import type { CalendarCell } from './dashboard-types.ts';

type DashboardCalendarProps = {
  compact: boolean;
  title: string;
  cells: CalendarCell[];
  selectedDate: string;
  todayDate: string;
  orderDates: Set<string>;
  onToggleCompact: () => void;
  onShift: (direction: -1 | 1) => void;
  onSelectDate: (dateKey: string) => void;
};

const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const DashboardCalendar = ({
  compact,
  title,
  cells,
  selectedDate,
  todayDate,
  orderDates,
  onToggleCompact,
  onShift,
  onSelectDate
}: DashboardCalendarProps) => (
  <section className="dashboard-calendar">
    <div className="dashboard-calendar-top">
      <div>
        <span>Agenda de produção</span>
        <h3>Calendário de pedidos</h3>
      </div>
      <div className="dashboard-calendar-mode" role="group" aria-label="Formato do calendário">
        <button type="button" className={compact ? 'active' : ''} onClick={() => !compact && onToggleCompact()}>Semana</button>
        <button type="button" className={!compact ? 'active' : ''} onClick={() => compact && onToggleCompact()}>Mês</button>
      </div>
    </div>
    <div className="dashboard-calendar-navigation">
      <button type="button" aria-label={compact ? 'Semana anterior' : 'Mês anterior'} onClick={() => onShift(-1)}>
        <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
      </button>
      <strong>{title}</strong>
      <button type="button" aria-label={compact ? 'Próxima semana' : 'Próximo mês'} onClick={() => onShift(1)}>
        <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
      </button>
    </div>
    <div className="dashboard-calendar-grid">
      {weekDays.map((day) => <span key={day} className="dashboard-calendar-weekday">{day}</span>)}
      {cells.map((cell, index) => cell ? (
        <button
          key={cell.dateKey}
          type="button"
          className={`dashboard-calendar-day ${selectedDate === cell.dateKey ? 'selected' : ''} ${todayDate === cell.dateKey ? 'today' : ''}`}
          onClick={() => onSelectDate(cell.dateKey)}
          aria-pressed={selectedDate === cell.dateKey}
        >
          <span>{cell.day}</span>
          {orderDates.has(cell.dateKey) ? <i aria-label="Há pedidos nesta data" /> : null}
        </button>
      ) : <span key={`empty-${index}`} className="dashboard-calendar-empty" />)}
    </div>
  </section>
);
