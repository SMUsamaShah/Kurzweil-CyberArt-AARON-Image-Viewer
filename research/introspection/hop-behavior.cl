;;; HOP-OR-DRAW references only point accessors, mode, and eight string literals.
;;; Capture its returned commands under dynamically scoped file-size modes.
(in-package :cl-user)
(unless (boundp 'aaron-hop-behavior-loaded)
  (set 'aaron-hop-behavior-loaded t)
  (with-open-file (report "C:\\temp\\aaron-hop-behavior.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 32) (*print-level* 8) (*print-circle* nil)
          (*print-pretty* nil) (owner (find-package "COMMON-GRAPHICS-USER")))
      (format report "BEGIN hop-behavior~%")
      (dolist (mode '("LARGE" "SMALL"))
        (progv (list (find-symbol "?FILE-SIZE?" owner)) (list (find-symbol mode owner))
          (dolist (bounds '(((10 20) (11 20)) ((10 20) (11 21))
                            ((10 20) (10 21)) ((10 20) (9 21))
                            ((10 20) (9 20)) ((10 20) (9 19))
                            ((10 20) (10 19)) ((10 20) (11 19))
                            ((10 20) (10 20)) ((10 20) (12 22))
                            ((10 20) (13 21)) ((10 20) (11 23))
                            ((10 20) (7 19)) ((10 20) (9 17))
                            ((-2 -3) (-1 -2)) ((0 0) (0.5 0.5))
                            ((0.1 0.2) (1.1 1.2)) ((0.1d0 0.2d0) (1.1d0 1.2d0))))
            (format report "TRY mode=~S args=~S~%" mode bounds)
            (finish-output report)
            (handler-case
                (let ((make (find-symbol "MAKE-TWOPT" owner)))
                  (format report "RESULT ~S~%"
                          (multiple-value-list
                           (funcall (find-symbol "HOP-OR-DRAW" owner)
                                    (apply make (car bounds)) (apply make (cadr bounds))))))
              (error (problem) (format report "ERROR ~S~%" (type-of problem))))
            (finish-output report))))
      (format report "END hop-behavior~%")
      (finish-output report))))
