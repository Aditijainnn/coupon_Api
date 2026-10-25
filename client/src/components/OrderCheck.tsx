import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, applyCoupon, type AppliedCoupon } from '../api';
import { Feedback } from './Feedback';
import { Receipt } from './Receipt';

interface OrderCheckProps {
  code: string;
  onCodeChange: (code: string) => void;
  /** Goes up by one each time a coupon's "Try … on an order" button is pressed. */
  focusRequest: number;
}

/** Applies a coupon to an order amount with POST /coupons/apply and prints the result. */
export function OrderCheck({ code, onCodeChange, focusRequest }: OrderCheckProps) {
  const [amount, setAmount] = useState('1000');
  const [result, setResult] = useState<AppliedCoupon | null>(null);
  const [printCount, setPrintCount] = useState(0);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  // A coupon's "Try … on an order" button was pressed: bring this form into view, ready for an amount.
  useEffect(() => {
    if (focusRequest === 0) {
      return;
    }
    sectionRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    amountRef.current?.focus({ preventScroll: true });
  }, [focusRequest, reduceMotion]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplying(true);
    setError('');
    try {
      // An empty field is sent as a missing amount, so the API can explain what's wrong.
      const applied = await applyCoupon(code, amount.trim() === '' ? undefined : Number(amount));
      setResult(applied);
      setPrintCount((count) => count + 1); // a new key prints a fresh receipt
    } catch (caught) {
      setResult(null);
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="checkout" ref={sectionRef} aria-labelledby="checkout-title">
      <form className="checkout__form" onSubmit={handleSubmit} noValidate>
        <div>
          <h2 id="checkout-title">Check an order</h2>
          <p className="section-intro">Enter a coupon code and an order amount to see the price after the discount.</p>
        </div>

        <div className="field-row">
          {/* A new key replays the highlight each time a code is filled in from the list. */}
          <div key={focusRequest} className={focusRequest > 0 ? 'field field--filled' : 'field'}>
            <label className="field__label" htmlFor="order-code">
              Coupon code
            </label>
            <input
              id="order-code"
              className="input input--code"
              value={code}
              onChange={(event) => onCodeChange(event.target.value)}
              placeholder="SAVE20"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="order-amount">
              Order amount
            </label>
            <input
              id="order-amount"
              ref={amountRef}
              className="input"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        </div>

        <motion.button type="submit" className="button" disabled={applying} whileTap={{ scale: 0.97 }}>
          {applying ? 'Applying…' : 'Apply coupon'}
        </motion.button>
        <Feedback error={error} />
      </form>

      <div className="checkout__receipt">
        {result ? (
          <Receipt key={printCount} result={result} />
        ) : (
          <p className="receipt-placeholder">Apply a coupon and the receipt prints here.</p>
        )}
      </div>
    </section>
  );
}
