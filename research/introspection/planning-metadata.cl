;;; Read-only linkage probe for the retained planning constructors.
;;;
;;; MASTER-PLAN and MAKE-PLAN are not invoked here.  The probe only records
;;; their callable signatures and compares the constructor constants retained
;;; by the compiled functions.  It must not invent an MPLAN instance or alter
;;; startup bindings.
(in-package :cl-user)

(unless (boundp 'aaron-planning-metadata-loaded)
  (set 'aaron-planning-metadata-loaded t)
  (with-open-file (report "C:\\temp\\aaron-planning-metadata.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 16)
          (*print-level* 6)
          (*print-circle* nil)
          (*print-pretty* nil)
          (owner (find-package "COMMON-GRAPHICS-USER")))
      (labels
          ((resolve (name)
             (and owner (find-symbol name owner)))
           (package-name-safe (symbol)
             (and (symbolp symbol)
                  (symbol-package symbol)
                  (package-name (symbol-package symbol))))
           (write-cell-error (problem)
             (when (typep problem 'cell-error)
               (let ((cell (cell-error-name problem)))
                 (when (symbolp cell)
                   (format report "ERROR-CELL ~S ~S~%"
                           (package-name-safe cell) (symbol-name cell))))))
           (write-error (label problem)
             (format report "~A-ERROR ~S~%" label (type-of problem))
             (write-cell-error problem)
             (finish-output report))
           (safe-arglist (arglist symbol fn)
             (handler-case
                 (multiple-value-list (funcall arglist symbol))
               (error ()
                 (handler-case
                     (multiple-value-list (funcall arglist fn))
                   (error (problem)
                     (write-cell-error problem)
                     (list :error (type-of problem)))))))
           (safe-constant (constant-fn fn index)
             (handler-case
                 (funcall constant-fn fn index)
               (error ()
                 (funcall constant-fn fn index))))
           (constant-type (value)
             (handler-case (type-of value)
               (error () :type-error))))
        (write-line "BEGIN planning-metadata" report)
        (finish-output report)
        (let* ((arglist (find-symbol "ARGLIST" "EXCL"))
               (count-fn (find-symbol "FUNCTION-CONSTANT-COUNT" "EXCL"))
               (constant-fn (find-symbol "FUNCTION-CONSTANT" "EXCL"))
               (mplan (resolve "MPLAN"))
               (prefs (resolve "PREFS"))
               (sdex (resolve "SDEX"))
               (figdex (resolve "FIGDEX"))
               (master-symbol (resolve "MASTER-PLAN"))
               (make-symbol (resolve "MAKE-PLAN"))
               (master-function (and master-symbol
                                     (fboundp master-symbol)
                                     (symbol-function master-symbol)))
               (make-function (and make-symbol
                                    (fboundp make-symbol)
                                    (symbol-function make-symbol)))
               (before-bindings
                 (list (and mplan (boundp mplan))
                       (and prefs (boundp prefs))
                       (and sdex (boundp sdex))
                       (and figdex (boundp figdex)))))
          (format report "HELPERS ARGLIST=~S COUNT=~S CONSTANT=~S~%"
                  (and arglist (package-name-safe arglist))
                  (and count-fn (package-name-safe count-fn))
                  (and constant-fn (package-name-safe constant-fn)))
          (format report "BINDINGS-BEFORE MPLAN=~S PREFS=~S SDEX=~S FIGDEX=~S~%"
                  (first before-bindings) (second before-bindings)
                  (third before-bindings) (fourth before-bindings))
          (finish-output report)
          (dolist (entry (list (list "MASTER-PLAN" master-symbol master-function)
                               (list "MAKE-PLAN" make-symbol make-function)))
            (let ((name (first entry))
                  (symbol (second entry))
                  (fn (third entry)))
              (format report "ARGLIST-BEGIN ~A~%" name)
              (finish-output report)
              (handler-case
                  (if (and symbol fn arglist)
                      (format report "ARGLIST ~A ~S~%"
                              name (safe-arglist arglist symbol fn))
                    (format report "ARGLIST ~A UNAVAILABLE~%" name))
                (error (problem) (write-error (format nil "ARGLIST ~A" name)
                                              problem)))
              (finish-output report)))
          (write-line "CONSTRUCTOR-LINK-BEGIN" report)
          (finish-output report)
          (handler-case
              (if (and master-function make-function count-fn constant-fn)
                  (let ((maker (funcall constant-fn make-function 0))
                        (master-1 (funcall constant-fn master-function 1))
                        (master-5 (funcall constant-fn master-function 5)))
                    (format report "CONSTRUCTOR-TYPES MAKE-PLAN=~S MASTER-1=~S MASTER-5=~S~%"
                            (constant-type maker)
                            (constant-type master-1)
                            (constant-type master-5))
                    (format report "MAKE-PLAN-EQ-MASTER-1 ~S~%"
                            (eq maker master-1))
                    (format report "MAKE-PLAN-EQ-MASTER-5 ~S~%"
                            (eq maker master-5)))
                (write-line "CONSTRUCTOR-LINK UNAVAILABLE" report))
            (error (problem) (write-error "CONSTRUCTOR-LINK" problem)))
          (finish-output report)
          (let ((after-bindings
                  (list (and mplan (boundp mplan))
                        (and prefs (boundp prefs))
                        (and sdex (boundp sdex))
                        (and figdex (boundp figdex)))))
            (format report "BINDINGS-AFTER MPLAN=~S PREFS=~S SDEX=~S FIGDEX=~S~%"
                    (first after-bindings) (second after-bindings)
                    (third after-bindings) (fourth after-bindings))
            (format report "BINDING-STATES-UNCHANGED ~S~%"
                    (equal before-bindings after-bindings)))
          (write-line "END planning-metadata" report)
          (finish-output report))))))
