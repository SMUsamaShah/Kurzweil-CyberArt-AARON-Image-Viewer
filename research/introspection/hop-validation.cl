;;; Exhaustive local offset grid; independent origins expose coordinate typos.
(in-package :cl-user)
(unless (boundp 'aaron-hop-validation-loaded)
  (set 'aaron-hop-validation-loaded t)
  (with-open-file (report "C:\\temp\\aaron-hop-validation.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* nil) (*print-level* 8) (*print-circle* nil)
          (*print-pretty* nil) (owner (find-package "COMMON-GRAPHICS-USER")))
      (format report "BEGIN hop-validation~%")
      (dolist (mode '("LARGE" "SMALL"))
        (progv (list (find-symbol "?FILE-SIZE?" owner)) (list (find-symbol mode owner))
          (dolist (a '((0 0) (5 -7) (-11 13)))
            (dolist (dx '(-2 -1 0 1 2))
              (dolist (dy '(-2 -1 0 1 2))
                (let ((b (list (+ (car a) dx) (+ (cadr a) dy)))
                      (make (find-symbol "MAKE-TWOPT" owner)))
                  (format report "TRY mode=~S args=~S~%" mode (list a b))
                  (finish-output report)
                  (handler-case
                      (format report "RESULT ~S~%"
                              (multiple-value-list
                               (funcall (find-symbol "HOP-OR-DRAW" owner)
                                        (apply make a) (apply make b))))
                    (error (problem) (format report "ERROR ~S~%" (type-of problem))))
                  (finish-output report)))))))
      (format report "END hop-validation~%")
      (finish-output report))))
