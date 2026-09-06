;;; Diagnose return shapes without assuming LOCK-WIGGLE returns one point.
(in-package :cl-user)
(unless (boundp 'aaron-point-shape-loaded)
  (set 'aaron-point-shape-loaded t)
  (with-open-file (report "C:\\temp\\aaron-point-shape.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 32) (*print-level* 12) (*print-circle* nil)
          (*print-pretty* nil)
          (owner (find-package "COMMON-GRAPHICS-USER"))
          (factory (find-symbol "MAKE-RANDOM-STATE-FROM-SEED" "EXCL")))
      (labels ((shape (value &optional (depth 0))
                 (cond ((numberp value) value)
                       ((null value) nil)
                       ((and (consp value) (< depth 5))
                        (list :cons (shape (car value) (1+ depth))
                              (shape (cdr value) (1+ depth))))
                       (t (handler-case
                              (list :point (type-of value)
                                    (funcall (find-symbol "X" owner) value)
                                    (funcall (find-symbol "Y" owner) value))
                            (error () (list :type (type-of value))))))))
        (format report "BEGIN point-shape~%")
        (dolist (name '("LOCK-WIGGLE" "POL-PT" "XYDIST"))
          (format report "ARGLIST ~S ~S~%" name
                  (funcall (find-symbol "ARGLIST" "EXCL") (find-symbol name owner))))
        (dolist (bounds '(((0 0) (10 0)) ((0 0) (0 0)) ((2 3) (12 8))))
          (let ((*random-state* (funcall factory 1))
                (make (find-symbol "MAKE-TWOPT" owner)))
            (format report "TRY ~S~%" bounds)
            (finish-output report)
            (handler-case
                (let ((values (multiple-value-list
                               (funcall (find-symbol "LOCK-WIGGLE" owner)
                                        (apply make (car bounds))
                                        (apply make (cadr bounds))))))
                  (format report "RETURNED~%")
                  (finish-output report)
                  (format report "SHAPE ~S~%" (mapcar #'shape values)))
              (error (problem)
                (format report "ERROR ~S~%" (type-of problem))
                ;; Print only a simple condition's format string, not its
                ;; arguments or arbitrary condition printer (which can stall).
                (handler-case
                    (let ((control (simple-condition-format-control problem)))
                      (when (stringp control)
                        (format report "CONTROL ~S~%" (subseq control 0 (min 512 (length control))))))
                  (error () nil))))
            (format report "NEXT-RANDOM ~S~%" (random 1000))
            (finish-output report)))
        (format report "END point-shape~%")
        (finish-output report)))))
