;;; Measure Allegro integer RANDOM/RAN limits that are not covered by the
;;; existing short numeric vectors.  The post-init planner trace showed
;;; larger integer bounds advancing the state in a way that needs a direct
;;; holdout before the JS model is extended.
(in-package :cl-user)

(unless (boundp 'aaron-random-integer-boundaries-loaded)
  (set 'aaron-random-integer-boundaries-loaded t)
  (with-open-file (report "C:\\temp\\aaron-random-integer-boundaries.txt"
                          :direction :output
                          :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* nil)
          (*print-level* 8)
          (*print-circle* nil)
          (*print-pretty* nil)
          (factory (find-symbol "MAKE-RANDOM-STATE-FROM-SEED" "EXCL"))
          (ran (find-symbol "RAN" "COMMON-GRAPHICS-USER")))
      (unless (and factory (fboundp factory) ran (fboundp ran))
        (error "Could not resolve Allegro seed factory and engine RAN"))
      (format report "BEGIN random-integer-boundaries~%")
      (finish-output report)
      (dolist (seed '(1234 5678))
        ;; RANDOM limits exercise the underlying integer conversion directly.
        ;; The 2^32 sentinel exposes a raw state checkpoint after each case.
        (dolist (limit '(1 2 3 4 5 6 7 10 11 21 51 101 181 1001 10001
                         536870911 536870912))
          (let ((state (funcall factory seed)) (values nil))
            (handler-case
                (progn
                  (dotimes (i 64)
                    (declare (ignore i))
                    (push (random limit state) values))
                  (format report "RANDOM seed=~D limit=~D VALUES ~S~%"
                          seed limit (nreverse values))
                  (handler-case
                      (format report "RANDOM-AFTER seed=~D limit=~D RAW ~S~%"
                              seed limit (random 4294967296 state))
                    (condition (problem)
                      (format report "RANDOM-AFTER-ERROR seed=~D limit=~D TYPE ~S~%"
                              seed limit (type-of problem))))
                  (finish-output report))
              (condition (problem)
                (format report "RANDOM-ERROR seed=~D limit=~D TYPE ~S~%"
                        seed limit (type-of problem))
                (finish-output report)))))
        ;; Engine-local integer RAN methods are measured separately because
        ;; their generic method is compiled against COMMON-LISP:RANDOM.
        (dolist (bounds '((0 0) (0 1) (0 2) (0 3) (0 5) (0 10)
                          (0 50) (0 100) (60 70) (120 135) (160 180)
                          (-4 5) (5 5)))
          (let ((*random-state* (funcall factory seed)) (values nil))
            (handler-case
                (progn
                  (dotimes (i 32)
                    (declare (ignore i))
                    (push (funcall ran (first bounds) (second bounds)) values))
                  (format report "RAN seed=~D bounds=~S VALUES ~S~%"
                          seed bounds (nreverse values))
                  (handler-case
                      (format report "RAN-AFTER seed=~D bounds=~S RAW ~S~%"
                              seed bounds (random 4294967296))
                    (condition (problem)
                      (format report "RAN-AFTER-ERROR seed=~D bounds=~S TYPE ~S~%"
                              seed bounds (type-of problem))))
                  (finish-output report))
              (condition (problem)
                (format report "RAN-ERROR seed=~D bounds=~S TYPE ~S~%"
                        seed bounds (type-of problem))
                (finish-output report))))))
      (format report "END random-integer-boundaries~%")
      (finish-output report))))
