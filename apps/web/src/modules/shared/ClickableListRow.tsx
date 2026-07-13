import type { KeyboardEvent, ReactNode } from 'react';

type ClickableListRowProps = {
  onOpen: () => void;
  main: ReactNode;
  actions?: ReactNode;
};

export const ClickableListRow = ({ onOpen, main, actions }: ClickableListRowProps) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <div
      className="list-row"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
    >
      <div>{main}</div>
      {actions ? <div className="inline-right">{actions}</div> : null}
    </div>
  );
};
