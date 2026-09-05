;;; Independent validation of hypotheses from random-reference.cl: legacy
;;; seeding, numeric conversions, larger limits, and crossing MT twist cycles.
(in-package :cl-user)
(unless (boundp 'aaron-random-validation-loaded)
  (set 'aaron-random-validation-loaded t)
  (with-open-file (report "C:\\temp\\aaron-random-validation.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* nil) (*print-level* 5)
          (factory (find-symbol "MAKE-RANDOM-STATE-FROM-SEED" "EXCL")))
      (format report "BEGIN random-validation~%")
      (finish-output report)
      (dolist (seed '(0 1 1234 5678 5489 4294967295 -1))
        (dolist (limit '(3 400000000 536870912 2147483647 4294967295
                        4294967296 0.1f0 10.0f0 0.1d0 10.0d0))
          (format report "TRY seed=~D limit=~S~%" seed limit)
          (finish-output report)
          (handler-case
              (let ((state (funcall factory seed)))
                (format report "VECTOR seed=~D limit=~S type=~S values=("
                        seed limit (type-of limit))
                (dotimes (i 32)
                  (when (> i 0) (write-char #\Space report))
                  (write (random limit state) :stream report))
                (format report ")~%"))
            (error (problem) (format report "ERROR ~A~%" problem)))
          (finish-output report)))
      (dolist (limit '(1000 1.0f0 1.0d0))
        (format report "TRY long seed=1234 limit=~S~%" limit)
        (finish-output report)
        (handler-case
            (let ((state (funcall factory 1234)))
              (format report "LONG seed=1234 limit=~S type=~S values=("
                      limit (type-of limit))
              (dotimes (i 1300)
                (when (> i 0) (write-char #\Space report))
                (write (random limit state) :stream report))
              (format report ")~%"))
          (error (problem) (format report "ERROR ~A~%" problem)))
        (finish-output report))
      (format report "END random-validation~%")
      (finish-output report))))
