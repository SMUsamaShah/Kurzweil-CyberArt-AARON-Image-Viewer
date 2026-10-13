;;; Distinguish a terminal bare-wiggle stop candidate from other FREE-PATH models.
;;; This single seeded edge is a local discriminator; the original report decides.
;;; Runs after the first natural SCREEN-AND-STORE invocation returns.
(in-package :cl-user)

(unless (boundp 'aaron-free-path-stop-boundary-v3-loaded)
  (set 'aaron-free-path-stop-boundary-v3-loaded t)
  (load "C:\\temp\\scene-state-snapshot-writer-stream-seeded-1234.cl")
  (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v3.txt"
                          :direction :output
                          :if-exists :supersede
                          :if-does-not-exist :create)
    (format report "BEGIN free-path-stop-boundary-v3~%")
    (format report "DEFERRED UNTIL FIRST SCREEN-AND-STORE RETURN~%")
    (finish-output report))
  (defun aaron-free-path-run-stop-boundary-v3 ()
    (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v3.txt"
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
                       (error () nil))))
                 (run-case (seed name)
                   (let* ((state (funcall factory seed))
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
                                       (error () :unavailable)))))))))
          (format report "CASES 1~%")
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
                 (run-case 521814 "bare-wiggle-versus-distance"))
            (setf (symbol-function ran) original-ran
                  (symbol-function dist) original-dist))
          (format report "RESTORED ~S~%"
                  (and (eq (symbol-function ran) original-ran)
                       (eq (symbol-function dist) original-dist)))
          (format report "END free-path-stop-boundary-v3~%")
          (finish-output report))))))
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (screen-symbol (and owner (find-symbol "SCREEN-AND-STORE" owner)))
         (screen-original (and screen-symbol (fboundp screen-symbol)
                               (symbol-function screen-symbol)))
         (screen-depth 0)
         (probe-ran nil))
    (unless screen-original
      (error "Could not resolve SCREEN-AND-STORE for deferred FREE-PATH boundary probe"))
    (setf (symbol-function screen-symbol)
          (let ((saved-screen screen-original))
            (lambda (&rest arguments)
              (let ((depth (incf screen-depth))
                    (completed nil))
                (unwind-protect
                     (multiple-value-prog1
                         (apply saved-screen arguments)
                       (setf completed t))
                  (unwind-protect
                       (when (and (= depth 1) completed (not probe-ran))
                         (setf probe-ran t)
                         (aaron-free-path-run-stop-boundary-v3))
                    (decf screen-depth)))))))
    (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v3.txt"
                            :direction :output
                            :if-exists :append
                            :if-does-not-exist :create)
      (format report "INSTALL screen-and-store-wrapper=POST-RETURN~%")
      (finish-output report))))
