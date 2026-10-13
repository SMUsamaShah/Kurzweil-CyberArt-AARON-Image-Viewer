;;; Compare competing FREE-PATH stop hypotheses on visibility-isolated edges.
;;; Seeds are local JS candidates only; the archived original report decides.
;;; Runs after MAIN and the writer-stream observer return.
(in-package :cl-user)

(unless (boundp 'aaron-free-path-stop-boundary-v2-loaded)
  (set 'aaron-free-path-stop-boundary-v2-loaded t)
  (load "C:\\temp\\scene-state-snapshot-writer-stream-seeded-1234.cl")
  (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v2.txt"
                          :direction :output
                          :if-exists :supersede
                          :if-does-not-exist :create)
    (format report "BEGIN free-path-stop-boundary-v2~%")
    (format report "DEFERRED UNTIL OUTER MAIN RETURN~%")
    (finish-output report))
  (defun aaron-free-path-run-stop-boundary-v2 ()
    (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v2.txt"
                            :direction :output
                            :if-exists :append
                            :if-does-not-exist :create)
      (let* ((*print-length* nil)
             (*print-level* 16)
             (*print-circle* nil)
             (*print-pretty* nil)
             (owner (find-package "COMMON-GRAPHICS-USER"))
             (make (find-symbol "MAKE-VISPT" owner))
             (ran (find-symbol "RAN" owner))
             (dist (find-symbol "XYDIST" owner))
             (original-ran (and ran (symbol-function ran)))
             (original-dist (and dist (symbol-function dist)))
             (factory (find-symbol "MAKE-RANDOM-STATE-FROM-SEED" "EXCL"))
             (x-reader (find-symbol "X" owner))
             (y-reader (find-symbol "Y" owner))
             (vis-reader (find-symbol "VIS" owner))
             (free-path (find-symbol "FREE-PATH" owner)))
        (labels ((point-values (value)
                   (list (funcall x-reader value)
                         (funcall y-reader value)
                         (funcall vis-reader value)))
                 (path-values (values)
                   (mapcar #'point-values values))
                 (emit-problem (problem)
                   (format report "ERROR TYPE ~S~%" (type-of problem))
                   (when (typep problem 'type-error)
                     (handler-case
                         (format report "TYPE-DATUM ~S EXPECTED ~S~%"
                                 (type-error-datum problem)
                                 (type-error-expected-type problem))
                       (error () nil)))))
          (format report "CASES 3~%")
          (finish-output report)
          (unwind-protect
               (progn
                 (setf (symbol-function ran)
                       (lambda (a b)
                         (let ((value (funcall original-ran a b)))
                           (format report "RAN (~S ~S) => ~S~%" a b value)
                           value)))
                 (setf (symbol-function dist)
                       (lambda (a b)
                         (let ((value (funcall original-dist a b)))
                           (format report "XYDIST ~S ~S => ~S~%"
                                   (point-values a) (point-values b) value)
                           value)))
                 (dolist (entry '((522862 "known-counterexample")
                                  (256819 "step-sum-early")
                                  (348048 "point-distance-early")))
                   (let* ((seed (first entry))
                          (name (second entry))
                          (state (funcall factory seed))
                          (points '((0 0 0) (10 0 1))))
                     (format report "CASE seed=~D name=~A POINTS ~S FDEX 0 TDEX 1 FROM 0 TO 1~%"
                             seed name points)
                     (finish-output report)
                     (let ((*random-state* state))
                       (progv (mapcar (lambda (value) (find-symbol value owner))
                                      '("FDEX" "TDEX" "FROM" "TO"))
                              '(0 1 0 1)
                         (handler-case
                             (let* ((edge (mapcar (lambda (point) (apply make point)) points))
                                    (result (funcall free-path edge)))
                               (format report "RESULT ~S~%" (path-values result))
                               (format report "EDGE-AFTER ~S~%" (path-values edge))
                               (format report "NEXT-RANDOM ~S STATUS OK~%"
                                       (random 100000)))
                           (error (problem)
                             (emit-problem problem)
                             (format report "NEXT-RANDOM ~S STATUS ERROR~%"
                                     (handler-case (random 100000)
                                       (error () :unavailable)))))))
                   (format report "ENDCASE~%")
                   (finish-output report)))
            (setf (symbol-function ran) original-ran
                  (symbol-function dist) original-dist))
          (format report "RESTORED ~S~%"
                  (and (eq (symbol-function ran) original-ran)
                       (eq (symbol-function dist) original-dist)))
          (format report "END free-path-stop-boundary-v2~%")
          (finish-output report))))))
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (main-symbol (and owner (find-symbol "MAIN" owner)))
         (main-original (and main-symbol (fboundp main-symbol)
                             (symbol-function main-symbol)))
         (main-depth 0)
         (probe-ran nil))
    (unless main-original
      (error "Could not resolve MAIN for deferred FREE-PATH boundary probe"))
    (setf (symbol-function main-symbol)
          (let ((saved-main main-original))
            (lambda (&rest arguments)
              (let ((depth (incf main-depth))
                    (completed nil))
                (unwind-protect
                     (multiple-value-prog1
                         (apply saved-main arguments)
                       (setf completed t))
                  (unwind-protect
                       (when (and (= depth 1) completed (not probe-ran))
                         (setf probe-ran t)
                         (aaron-free-path-run-stop-boundary-v2))
                    (decf main-depth)))))))
    (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v2.txt"
                            :direction :output
                            :if-exists :append
                            :if-does-not-exist :create)
      (format report "INSTALL main-wrapper=OUTER-OF-WRITER-STREAM~%")
      (finish-output report))))
