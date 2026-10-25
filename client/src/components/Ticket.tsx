import { motion } from 'motion/react';
import { formatDateTime } from '../format';
import { TiltCard, type PointerSpot } from './TiltCard';

interface TicketProps {
  code: string;
  discount: number;
  /** ISO date, or null while no valid expiry has been picked (only in the live preview). */
  expiresAt: string | null;
  expired?: boolean;
  size?: 'large' | 'small';
  /** Where the ticket leans when the pointer isn't over it. */
  rest?: PointerSpot;
}

function expiryText(expiresAt: string | null, expired: boolean): string {
  if (expiresAt === null) {
    return 'Pick an expiry date';
  }
  return `${expired ? 'Ended' : 'Valid until'} ${formatDateTime(expiresAt)}`;
}

/** A coupon drawn as a printed ticket: discount, code and expiry, with a tear-off stub. */
export function Ticket({ code, discount, expiresAt, expired = false, size = 'small', rest }: TicketProps) {
  const classes = ['ticket', `ticket--${size}`, expired ? 'ticket--expired' : ''].join(' ');

  return (
    <TiltCard className={classes} maxTilt={size === 'large' ? 16 : 9} rest={rest}>
      <div className="ticket__main">
        <p className="ticket__value">
          <span className="ticket__number">{discount}</span>
          <span className="ticket__unit">% off</span>
        </p>
        <p className="ticket__code">{code}</p>
        <p className="ticket__expiry">{expiryText(expiresAt, expired)}</p>
      </div>
      <div className="ticket__stub" aria-hidden="true">
        <span className="ticket__barcode" />
      </div>
      {expired && (
        <motion.span
          className="ticket__stamp"
          initial={{ scale: 1.8, opacity: 0, rotate: -28 }}
          animate={{ scale: 1, opacity: 1, rotate: -14 }}
          transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.35 }}
        >
          Expired
        </motion.span>
      )}
    </TiltCard>
  );
}
