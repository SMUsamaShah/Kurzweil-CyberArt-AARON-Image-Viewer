;;; Boundary matrix for FREE-PATH beyond the initial 16-shape validation set.
;;; Install the normal writer-stream observer first, then wrap MAIN outside it.
;;; Run the matrix only after the original scene and its capture have finished;
;;; the earlier pre-scene version changed a natural STORE-IN-FILE argument.
(in-package :cl-user)

(unless (boundp 'aaron-free-path-boundaries-loaded)
  (set 'aaron-free-path-boundaries-loaded t)
  ;; The runner loads this probe before its selected mode source.  Load the
  ;; selected writer-stream source here so this wrapper can sit outside the
  ;; scene observer.  The runner's following load is idempotent.
  (load "C:\\temp\\scene-state-snapshot-writer-stream-seeded-1234.cl")
  (with-open-file (report "C:\\temp\\aaron-free-path-boundaries.txt"
                          :direction :output
                          :if-exists :supersede
                          :if-does-not-exist :create)
    (format report "BEGIN free-path-boundaries~%")
    (format report "DEFERRED UNTIL OUTER MAIN RETURN~%")
    (finish-output report))
  (defun aaron-free-path-run-boundaries ()
    (with-open-file (report "C:\\temp\\aaron-free-path-boundaries.txt"
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
           (free-path (find-symbol "FREE-PATH" owner))
           (specs
             (list
              (list :name "line-visible" :points '((0 0 1) (10 0 1)) :fdex 0 :tdex 1 :from 0 :to 1)
              (list :name "line-zero-target" :points '((0 0 1) (10 0 0)) :fdex 0 :tdex 1 :from 0 :to 1)
              (list :name "line-zero-source" :points '((0 0 0) (10 0 1)) :fdex 0 :tdex 1 :from 0 :to 1)
              (list :name "line-coincident" :points '((4 4 1) (4 4 1)) :fdex 0 :tdex 1 :from 0 :to 1)
              (list :name "line-negative" :points '((-23 41 1) (-51 -7 1)) :fdex 0 :tdex 1 :from 0 :to 1)
              (list :name "line-double" :points '((1.25d0 -2.5d0 1) (19.75d0 7.125d0 1)) :fdex 0 :tdex 1 :from 0 :to 1)
              (list :name "line-single" :points '((1.25s0 -2.5s0 1) (19.75s0 7.125s0 1)) :fdex 0 :tdex 1 :from 0 :to 1)
              (list :name "triangle-visible" :points '((0 0 1) (10 0 1) (5 10 1)) :fdex 0 :tdex 2 :from 0 :to 1)
              (list :name "triangle-mixed" :points '((0 0 1) (10 0 0) (5 10 2)) :fdex 0 :tdex 2 :from 0 :to 1)
              (list :name "triangle-negative-vis" :points '((0 0 -1) (10 0 2) (5 10 -3)) :fdex 0 :tdex 2 :from 0 :to 1)
              (list :name "square-visible" :points '((0 0 1) (10 0 1) (10 10 1) (0 10 1)) :fdex 0 :tdex 3 :from 0 :to 1)
              (list :name "square-alternating" :points '((0 0 1) (10 0 0) (10 10 1) (0 10 0)) :fdex 0 :tdex 3 :from 0 :to 1)
              (list :name "pentagon-visible" :points '((0 0 1) (8 -2 1) (13 7 1) (5 14 1) (-3 8 1)) :fdex 0 :tdex 4 :from 0 :to 1)
              (list :name "long-edge" :points '((-1000 -750 1) (1000 1250 1)) :fdex 0 :tdex 1 :from 0 :to 1)
              (list :name "fractional-vis" :points '((0 0 0.5d0) (10 0 0.25d0)) :fdex 0 :tdex 1 :from 0 :to 1)
              (list :name "negative-zero" :points '((-0.0d0 0.0d0 1) (10.0d0 -0.0d0 1)) :fdex 0 :tdex 1 :from 0 :to 1)
              (list :name "range-middle" :points '((0 0 1) (10 0 1) (10 10 1) (0 10 1)) :fdex 1 :tdex 2 :from 1 :to 2)
              (list :name "range-tail" :points '((0 0 1) (10 0 1) (10 10 1) (0 10 1)) :fdex 2 :tdex 3 :from 2 :to 3)
              (list :name "range-reverse" :points '((0 0 1) (10 0 1) (10 10 1) (0 10 1)) :fdex 2 :tdex 1 :from 2 :to 1)
              (list :name "from-reverse" :points '((0 0 1) (10 0 1) (10 10 1)) :fdex 0 :tdex 2 :from 1 :to 0))))
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
        (format report "MAIN-RETURNED T~%")
        (format report "CASES ~D~%" (* 2 (length specs)))
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
              (dolist (seed '(1 1234))
                (dolist (spec specs)
                  (let* ((points (getf spec :points))
                         (fdex (getf spec :fdex))
                         (tdex (getf spec :tdex))
                         (from (getf spec :from))
                         (to (getf spec :to))
                         (name (getf spec :name))
                         (state (funcall factory seed)))
                    (format report "CASE seed=~D name=~A POINTS ~S FDEX ~D TDEX ~D FROM ~D TO ~D~%"
                            seed name points fdex tdex from to)
                    (finish-output report)
                    (let ((*random-state* state))
                      (progv (mapcar (lambda (value) (find-symbol value owner))
                                     '("FDEX" "TDEX" "FROM" "TO"))
                             (list fdex tdex from to)
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
                                    (handler-case (random 100000) (error () :unavailable))))))))
                    (format report "ENDCASE~%")
                    (finish-output report))))
          ;; Keep the saved functions in scope through the restoration check.
          (setf (symbol-function ran) original-ran
                (symbol-function dist) original-dist))
        (format report "RESTORED ~S~%"
                (and (eq (symbol-function ran) original-ran)
                     (eq (symbol-function dist) original-dist)))
        (format report "END free-path-boundaries~%")
        (finish-output report)))))
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (main-symbol (and owner (find-symbol "MAIN" owner)))
         (main-original (and main-symbol (fboundp main-symbol)
                             (symbol-function main-symbol)))
         (main-depth 0)
         (matrix-ran nil))
    (unless main-original
      (error "Could not resolve MAIN for deferred FREE-PATH probe"))
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
                       (when (and (= depth 1) completed (not matrix-ran))
                         (setf matrix-ran t)
                         (aaron-free-path-run-boundaries))
                    (decf main-depth)))))))
    (with-open-file (report "C:\\temp\\aaron-free-path-boundaries.txt"
                            :direction :output
                            :if-exists :append
                            :if-does-not-exist :create)
      (format report "INSTALL main-wrapper=OUTER-OF-WRITER-STREAM~%")
      (finish-output report))))
