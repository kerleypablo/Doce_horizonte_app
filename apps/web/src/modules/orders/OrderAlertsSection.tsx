import type { OrderItem } from './order-types.ts';

export const OrderAlertsSection = ({ alerts, onToggle }: {
  alerts: OrderItem['alerts'];
  onToggle: (index: number, enabled: boolean) => void;
}) => (
  <div className="panel form-box">
    <h4>Alertas (modelo)</h4>
    <div className="form">
      {alerts.map((alert, index) => (
        <label key={`${alert.label}-${index}`} className="inline-right">
          <input type="checkbox" checked={alert.enabled} onChange={(event) => onToggle(index, event.target.checked)} />
          <span>{alert.label}</span>
        </label>
      ))}
    </div>
  </div>
);
