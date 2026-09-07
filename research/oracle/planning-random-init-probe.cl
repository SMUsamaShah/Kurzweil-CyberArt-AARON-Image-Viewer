;;; Probe the state constructors used by INIT-RANDOM, if they remain
;;; dynamically callable in the archived image.  The shared helper first
;;; installs the normal INIT-RANDOM/RAN observers; these wrappers are then
;;; installed before the screen-saver entry point runs.
(in-package :cl-user)
(set 'aaron-planning-seed 1234)
(set 'aaron-planning-set-rseed nil)
(set 'aaron-planning-rseed-roundtrip nil)
(load "C:\\temp\\planning-random-seed-common.cl")

(defun aaron-init-probe-install (package-name function-name)
  (handler-case
      (let* ((package (find-package package-name))
             (symbol (and package (find-symbol function-name package))))
        (cond
          ((null package)
           (aaron-random-emit
            (format nil "INIT-CONSTRUCTOR-PACKAGE-MISSING ~A" package-name)))
          ((null symbol)
           (aaron-random-emit
            (format nil "INIT-CONSTRUCTOR-SYMBOL-MISSING ~A::~A"
                    package-name function-name)))
          ((not (fboundp symbol))
           (aaron-random-emit
            (format nil "INIT-CONSTRUCTOR-UNBOUND ~A::~A"
                    package-name function-name)))
          (t
           (let ((original (symbol-function symbol))
                 (count 0))
             (setf (symbol-function symbol)
                   (lambda (&rest args)
                     (let ((call-number (incf count)))
                       (when (<= call-number 16)
                         (aaron-random-emit
                          (format nil
                                  "INIT-CONSTRUCTOR-BEFORE ~A::~A CALL ~D ARGS ~S"
                                  package-name function-name call-number args)))
                       (multiple-value-prog1
                           (apply original args)
                         (when (<= call-number 16)
                           (aaron-random-emit
                            (format nil
                                    "INIT-CONSTRUCTOR-AFTER ~A::~A CALL ~D"
                                    package-name function-name call-number)))))))
             (aaron-random-emit
              (format nil "INIT-CONSTRUCTOR-INSTALLED ~A::~A TYPE ~S"
                      package-name function-name (type-of original)))))))
    (condition (problem)
      (aaron-random-emit
       (format nil "INIT-CONSTRUCTOR-INSTALL-ERROR ~A::~A TYPE ~S"
               package-name function-name (type-of problem))))))

(aaron-init-probe-install "COMMON-LISP" "MAKE-RANDOM-STATE")
(aaron-init-probe-install "EXCL" "MAKE-RANDOM-STATE-FROM-SEED")
