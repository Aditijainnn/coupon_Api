import { AnimatePresence, motion } from 'motion/react';
import type { Coupon } from '../api';
import { Ticket } from './Ticket';

export type ListState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

interface CouponListProps {
  coupons: Coupon[];
  state: ListState;
  onRetry: () => void;
  /** Called with a coupon's code when "Try … on an order" is pressed. */
  onTry: (code: string) => void;
}

/** Every coupon from GET /coupons, newest first. Expired ones stay visible with a stamp. */
export function CouponList({ coupons, state, onRetry, onTry }: CouponListProps) {
  return (
    <section className="coupons" aria-labelledby="coupons-title">
      <h2 id="coupons-title">
        Your coupons
        {state.status === 'ready' && coupons.length > 0 && <span className="count">{coupons.length}</span>}
      </h2>

      {state.status === 'loading' && (
        <div className="coupons__grid" aria-busy="true" aria-label="Loading coupons">
          <div className="ticket-skeleton" />
          <div className="ticket-skeleton" />
          <div className="ticket-skeleton" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="notice" role="alert">
          <p>{state.message}</p>
          <button type="button" className="button button--quiet" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {state.status === 'ready' && coupons.length === 0 && (
        <p className="coupons__empty">No coupons yet. Create one above and it lands here.</p>
      )}

      {state.status === 'ready' && coupons.length > 0 && (
        <ul className="coupons__grid">
          <AnimatePresence>
            {coupons.map((coupon, index) => (
              <motion.li
                key={coupon.id}
                className="coupons__item"
                layout
                // Each ticket drops onto the counter, tipping forward from above.
                initial={{ opacity: 0, y: -48, rotateX: -65 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                transition={{
                  default: { type: 'spring', stiffness: 240, damping: 22, delay: Math.min(index, 8) * 0.06 },
                  layout: { type: 'spring', stiffness: 300, damping: 30 },
                }}
              >
                <Ticket code={coupon.code} discount={coupon.discount} expiresAt={coupon.expiresAt} expired={coupon.isExpired} />
                <button type="button" className="link-button" onClick={() => onTry(coupon.code)}>
                  Try {coupon.code} on an order
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
