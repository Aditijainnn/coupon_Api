import { animate, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { AppliedCoupon } from '../api';
import { formatDateTime, formatMoney } from '../format';

/** Counts from the original amount down to the final one, so you can see the price drop. */
function CountingAmount({ from, to }: { from: number; to: number }) {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(reduceMotion ? to : from);

  useEffect(() => {
    if (reduceMotion) {
      setValue(to);
      return;
    }
    const controls = animate(from, to, { duration: 0.9, delay: 0.55, ease: 'easeOut', onUpdate: setValue });
    return () => controls.stop();
  }, [from, to, reduceMotion]);

  return <>{formatMoney(value)}</>;
}

/** The result of POST /coupons/apply, printed like a till receipt. */
export function Receipt({ result }: { result: AppliedCoupon }) {
  const reduceMotion = useReducedMotion();
  const [printedAt] = useState(() => new Date().toISOString());

  return (
    <motion.div
      className="receipt"
      // The paper feeds out of the printer from the top down.
      initial={reduceMotion ? false : { clipPath: 'inset(0% 0% 100% 0%)', y: -12 }}
      animate={{ clipPath: 'inset(0% 0% 0% 0%)', y: 0 }}
      transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <p className="receipt__time">{formatDateTime(printedAt)}</p>
      <dl className="receipt__lines">
        <div className="receipt__line">
          <dt>Order amount</dt>
          <dd>{formatMoney(result.originalAmount)}</dd>
        </div>
        <div className="receipt__line">
          <dt>
            {result.code}, {result.discountPercent}% off
          </dt>
          <dd>−{formatMoney(result.discountAmount)}</dd>
        </div>
        <div className="receipt__line receipt__line--total">
          <dt>To pay</dt>
          <dd>
            <span aria-hidden="true">
              <CountingAmount from={result.originalAmount} to={result.finalAmount} />
            </span>
            <span className="visually-hidden">{formatMoney(result.finalAmount)}</span>
          </dd>
        </div>
      </dl>
    </motion.div>
  );
}
