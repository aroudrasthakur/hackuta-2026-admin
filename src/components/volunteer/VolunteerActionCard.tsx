import { Link } from "react-router-dom";
import type { ReactNode } from "react";

type VolunteerActionCardProps = {
  to: string;
  title: string;
  description: string;
  icon: ReactNode;
};

/** Large, one-thumb action target for volunteer responsibilities. */
export function VolunteerActionCard({
  to,
  title,
  description,
  icon,
}: VolunteerActionCardProps) {
  return (
    <Link to={to} className="volunteer-action-card">
      <span className="volunteer-action-card__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="volunteer-action-card__body">
        <span className="volunteer-action-card__title">{title}</span>
        <span className="volunteer-action-card__description">{description}</span>
      </span>
      <span className="volunteer-action-card__chevron" aria-hidden="true">
        →
      </span>
    </Link>
  );
}
