;;; Capture STORE-IN-FILE into a private string stream and inspect point state.
;;; Dynamically bound globals are restored after every call.
(in-package :cl-user)
(unless (boundp 'aaron-store-behavior-loaded)
  (set 'aaron-store-behavior-loaded t)
  (with-open-file (report "C:\\temp\\aaron-store-behavior.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let* ((*print-length* nil) (*print-level* 8) (*print-circle* nil)
           (*print-pretty* nil) (owner (find-package "COMMON-GRAPHICS-USER"))
           (make (find-symbol "MAKE-TWOPT" owner))
           (store (find-symbol "STORE-IN-FILE" owner))
           (previous (find-symbol "PREV-STORED-PT" owner)))
      (labels ((coords (point)
                 (if (null point) nil
                   (list (funcall (find-symbol "X" owner) point)
                         (funcall (find-symbol "Y" owner) point)))))
        (format report "BEGIN store-behavior~%")
        (dolist (mode '("LARGE" "SMALL"))
          (dolist (redraw '(nil t))
          (dolist (plot '(nil t))
              (dolist (controls '(nil t))
                (dolist (prior '((10 20) (50 60)))
                (dolist (b '((11 20) (9 19) (14 22)))
                  (dolist (name '("MOVE-TO" "DRAW-TO" "VECTOR" "FILL"))
                    (let ((output (make-string-output-stream)))
                      (progv (list (find-symbol "*TEMP*" owner) previous
                                   (find-symbol "?FILE-SIZE?" owner) (find-symbol "PLOT" owner)
                                   (find-symbol "CONTROLS-VISIBLE" owner))
                             (list output (apply make prior) (find-symbol mode owner) plot controls)
                        (format report "TRY method=~S mode=~S redraw=~S plot=~S controls=~S previous=~S args=~S~%"
                                name mode redraw plot controls prior (list '(10 20) b))
                        (finish-output report)
                        (handler-case
                            (funcall store (find-symbol name owner)
                                     :pta (funcall make 10 20) :ptb (apply make b) :redraw redraw)
                          (error (problem)
                            (format report "ERROR ~S~%" (type-of problem))
                            (when (typep problem 'cell-error)
                              (let ((cell (cell-error-name problem)))
                                (when (symbolp cell)
                                  (format report "ERROR-CELL ~S ~S~%"
                                          (and (symbol-package cell) (package-name (symbol-package cell)))
                                          (symbol-name cell)))))))
                        (format report "OUTPUT ~S~%"
                                (map 'list #'char-code (get-output-stream-string output)))
                        (format report "PREVIOUS ~S~%" (coords (symbol-value previous)))
                        (format report "ENDCASE~%")
                        (finish-output report))))))))))
        (format report "END store-behavior~%")
        (finish-output report)))))
