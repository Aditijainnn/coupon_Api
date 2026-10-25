import { motion, useAnimate, useReducedMotion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { ApiError, createCoupon, type Coupon } from '../api';
import { defaultExpiryInput, localInputToIso } from '../format';
import { Feedback } from './Feedback';
import { Ticket } from './Ticket';

interface CouponCreatorProps {
  onCreated: (coupon: Coupon) => void;
}

/** The large preview ticket leans towards the top right while the pointer is elsewhere. */
const PREVIEW_REST = { x: 0.32, y: -0.24 };

/**
 * The "New coupon" form, next to a large ticket that previews the coupon as you type.
 * The form sends what was typed as it is: the API trims and uppercases the code and checks
 * every field, and its error messages are shown under the button.
 */
export function CouponCreator({ onCreated }: CouponCreatorProps) {
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState(20);
  const [expiresAt, setExpiresAt] = useState(defaultExpiryInput);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [ticketRef, animateTicket] = useAnimate<HTMLDivElement>();
  const reduceMotion = useReducedMotion();

  const previewCode = code.trim().toUpperCase() || 'YOUR-CODE';
  const expiresAtIso = localInputToIso(expiresAt);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setCreatedCode('');
    try {
      const coupon = await createCoupon({ code, discount, expiresAt: expiresAtIso ?? undefined });
      onCreated(coupon);
      setCreatedCode(coupon.code);
      if (!reduceMotion) {
        // The ticket spins once, as if it had just been printed and handed over.
        await animateTicket(ticketRef.current, { rotateY: [0, 360], scale: [1, 0.88, 1] }, { duration: 0.9 });
      }
      setCode('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="creator" aria-labelledby="creator-title">
      <form className="creator__form" onSubmit={handleSubmit} noValidate>
        <h2 id="creator-title">New coupon</h2>

        <div className="field">
          <label className="field__label" htmlFor="new-code">
            Code
          </label>
          <input
            id="new-code"
            className="input input--code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="SAVE20"
            maxLength={50}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="new-code-hint"
          />
          <p id="new-code-hint" className="field__hint">
            Saved in capital letters, so save20 and SAVE20 are the same coupon.
          </p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="new-discount">
            Discount <output className="field__value" htmlFor="new-discount">{discount}%</output>
          </label>
          <input
            id="new-discount"
            className="range"
            type="range"
            min={1}
            max={90}
            step={1}
            value={discount}
            onChange={(event) => setDiscount(Number(event.target.value))}
          />
          <p className="field__scale" aria-hidden="true">
            <span>1%</span>
            <span>90%</span>
          </p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="new-expires">
            Expires
          </label>
          <input
            id="new-expires"
            className="input"
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </div>

        <motion.button type="submit" className="button" disabled={saving} whileTap={{ scale: 0.97 }}>
          {saving ? 'Creating…' : 'Create coupon'}
        </motion.button>
        <Feedback error={error} success={createdCode && `Created ${createdCode}. It's now first in your coupons.`} />
      </form>

      <div className="creator__preview">
        <div className="creator__float">
          <div ref={ticketRef} className="creator__flip">
            <Ticket size="large" code={previewCode} discount={discount} expiresAt={expiresAtIso} rest={PREVIEW_REST} />
          </div>
        </div>
      </div>
    </section>
  );
}
