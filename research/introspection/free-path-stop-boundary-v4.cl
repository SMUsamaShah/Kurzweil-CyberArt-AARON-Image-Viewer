;;; Distinguish local FREE-PATH stop candidates with one isolated seeded edge.
;;; The focused case runs once at the first traced STORE-IN-FILE return.
(in-package :cl-user)

(unless (boundp 'aaron-free-path-stop-boundary-v4-loaded)
  (set 'aaron-free-path-stop-boundary-v4-loaded t)
  (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v4.txt"
                          :direction :output
                          :if-exists :supersede
                          :if-does-not-exist :create)
    (format report "BEGIN free-path-stop-boundary-v4~%")
    (format report "DEFERRED UNTIL FIRST STORE-IN-FILE EXIT~%")
    (finish-output report))
  (defun aaron-free-path-run-stop-boundary-v4 ()
    (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v4.txt"
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
             (case-status "OK"))
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
                     (format report "CASE-START seed=~D name=~A~%" seed name)
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
                             (setf case-status "ERROR")
                             (emit-problem problem)
                             (format report "NEXT-RANDOM ~S STATUS ERROR~%"
                                     (handler-case (random 100000)
                                       (error () :unavailable)))))
                     (format report "ENDCASE~%")
                     (finish-output report))))))
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
          (format report "CASE-END~%")
          (finish-output report)
          case-status))))
  (defvar aaron-free-path-stop-boundary-v4-triggered nil)
  (defun aaron-free-path-stop-boundary-v4-event-hook (event name args entry-depth)
    (declare (ignore args))
    (when (and (eq event :exit)
               (string= name "STORE-IN-FILE")
               (not aaron-free-path-stop-boundary-v4-triggered))
      (setf aaron-free-path-stop-boundary-v4-triggered t)
      (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v4.txt"
                              :direction :output
                              :if-exists :append
                              :if-does-not-exist :create)
        (format report "HOOK-ENTER event=~S name=~A depth=~S~%"
                event name entry-depth)
        (finish-output report))
      (let ((status "OK"))
        (handler-case
            (unless (string= (aaron-free-path-run-stop-boundary-v4) "OK")
              (setf status "ERROR"))
          (condition (problem)
            (setf status "ERROR")
            (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v4.txt"
                                    :direction :output
                                    :if-exists :append
                                    :if-does-not-exist :create)
              (format report "HOOK-ERROR TYPE ~S~%" (type-of problem))
              (finish-output report))))
        (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v4.txt"
                                :direction :output
                                :if-exists :append
                                :if-does-not-exist :create)
          (format report "HOOK-EXIT status=~A~%" status)
          (format report "END free-path-stop-boundary-v4~%")
          (finish-output report)))))
  ;; Set the event callback before the writer-stream chain loads the trace.
  (set 'aaron-planning-post-event-hook
       #'aaron-free-path-stop-boundary-v4-event-hook)
  (set 'aaron-planning-extra-targets '("PREP-LINE" "STORE-IN-FILE"))
  (load "C:\\temp\\scene-state-snapshot-writer-stream-seeded-1234.cl")
  (with-open-file (report "C:\\temp\\aaron-free-path-stop-boundary-v4.txt"
                          :direction :output
                          :if-exists :append
                          :if-does-not-exist :create)
    (format report "INSTALL planning-trace-post-event=STORE-IN-FILE-EXIT~%")
    (finish-output report)))
