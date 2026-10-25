import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getHealth, listCoupons, type Coupon } from './api';
import { CouponCreator } from './components/CouponCreator';
import { CouponList, type ListState } from './components/CouponList';
import { HealthBadge, type HealthState } from './components/HealthBadge';
import { OrderCheck } from './components/OrderCheck';

const HEALTH_CHECK_EVERY_MS = 10_000;

export default function App() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [health, setHealth] = useState<HealthState>('checking');
  const [orderCode, setOrderCode] = useState('');
  const [orderFocusRequest, setOrderFocusRequest] = useState(0);
  const lastHealth = useRef<HealthState>('checking');

  const loadCoupons = useCallback(async () => {
    setListState({ status: 'loading' });
    try {
      setCoupons(await listCoupons());
      setListState({ status: 'ready' });
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'The coupons could not be loaded.';
      setListState({ status: 'error', message });
    }
  }, []);

  useEffect(() => {
    void loadCoupons();
  }, [loadCoupons]);

  // Check GET /health now and every few seconds. When the API or database comes back, reload the list.
  useEffect(() => {
    let stopped = false;

    async function checkHealth() {
      const result = await getHealth();
      if (stopped) {
        return;
      }
      const next: HealthState = result === null ? 'api-down' : result.database === 'connected' ? 'ok' : 'database-down';
      const wasDown = lastHealth.current === 'api-down' || lastHealth.current === 'database-down';
      if (next === 'ok' && wasDown) {
        void loadCoupons();
      }
      lastHealth.current = next;
      setHealth(next);
    }

    void checkHealth();
    const timer = window.setInterval(checkHealth, HEALTH_CHECK_EVERY_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [loadCoupons]);

  function handleCreated(coupon: Coupon) {
    setCoupons((current) => [coupon, ...current]);
  }

  function handleTry(code: string) {
    setOrderCode(code);
    setOrderFocusRequest((count) => count + 1);
  }

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <h1 className="masthead__title">Coupon desk</h1>
          <p className="masthead__intro">
            Create discount coupons, keep track of the ones you've made, and see what an order costs with one applied.
          </p>
        </div>
        <HealthBadge state={health} />
      </header>

      <main className="sections">
        <CouponCreator onCreated={handleCreated} />
        <CouponList coupons={coupons} state={listState} onRetry={() => void loadCoupons()} onTry={handleTry} />
        <OrderCheck code={orderCode} onCodeChange={setOrderCode} focusRequest={orderFocusRequest} />
      </main>

      <footer className="footer">This page uses the Coupon API running on localhost:3000.</footer>
    </div>
  );
}
