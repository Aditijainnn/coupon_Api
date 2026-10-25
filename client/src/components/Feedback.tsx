import { AnimatePresence, motion } from 'motion/react';

interface FeedbackProps {
  error: string;
  success?: string;
}

/** The line under a form: the API's error message (with a small shake) or a success note. */
export function Feedback({ error, success = '' }: FeedbackProps) {
  return (
    <div className="feedback">
      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            key={`error:${error}`}
            className="feedback__error"
            role="alert"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: [0, -10, 9, -6, 4, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
          >
            {error}
          </motion.p>
        ) : success ? (
          <motion.p
            key={`success:${success}`}
            className="feedback__success"
            role="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {success}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
