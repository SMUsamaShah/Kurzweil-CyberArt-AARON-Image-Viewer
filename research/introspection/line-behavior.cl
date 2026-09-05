;;; Controlled calls to numeric line helpers. Do not invoke brush, mapping, or
;;; drawing routines here: their arguments are application objects and their
;;; side effects are not yet understood. Every call has a checkpoint so a
;;; bad numeric case is distinguishable from a probe that never started.
(in-package :cl-user)
(unless (boundp 'aaron-line-behavior-loaded)
  (set 'aaron-line-behavior-loaded t)
  (with-open-file (report "C:\\temp\\aaron-line-behavior.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 40) (*print-level* 8) (*print-circle* t)
          (owner (find-package "COMMON-GRAPHICS-USER")))
      (labels ((call (name args)
                 (format report "TRY ~S args=~S~%" name args)
                 (finish-output report)
                 (handler-case
                     (let ((symbol (find-symbol name owner)))
                       (unless (and symbol (fboundp symbol))
                         (error "No function binding for ~A" name))
                       (format report "RESULT ~S values=~S~%" name
                               (multiple-value-list
                                (apply (symbol-function symbol) args))))
                   (error (problem)
                     (format report "ERROR ~S ~A~%" name problem)))
                 (finish-output report)))
        (format report "BEGIN line-behavior~%")
        (finish-output report)
        (dolist (args '((0 0 1 0) (0 0 0 1) (0 0 -1 0) (0 0 0 -1)
                        (0 0 1 1) (10 20 13 24) (0 0 0 0)
                        (0.0 0.0 1.0 0.0) (-2.5 4.0 3.5 -1.0)))
          (call "DIRECTION" args))
        (dolist (args '((0 0) (0 90) (90 0) (-180 180) (180 -180)
                        (359 1) (1 359) (-3.5 4.5)))
          (call "ANGLE-DIF" args))
        (dolist (args '((0 -10 10) (90 0 180) (-180 -90 90)
                        (359 350 10) (1 350 10) (0 0 0) (0.0 -1.0 1.0)))
          (call "ANGLE-RANGE" args))
        (dolist (args '((0 10) (-10 10) (10 10) (0.0 1.0)
                        (0.0 10.0) (10 0)))
          (call "RAN" args))
        (format report "END line-behavior~%")
        (finish-output report)))))
