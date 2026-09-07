;;; Read-only constants and signatures for the screensaver entry graph.
;;;
;;; The normal generator did not cross the replacement function cells in the
;;; call-trace probe.  This probe therefore inspects the compiled constants of
;;; likely entry routines without invoking them.  A symbol/constant reference
;;; is a lead about a compiled call edge, not proof of runtime order.
(in-package :cl-user)

(unless (boundp 'aaron-entry-constants-loaded)
  (set 'aaron-entry-constants-loaded t)
  (with-open-file (report "C:\\temp\\aaron-entry-constants.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 12)
          (*print-level* 5)
          (*print-circle* nil)
          (*print-pretty* nil)
          (owner (find-package "COMMON-GRAPHICS-USER"))
          (arglist (find-symbol "ARGLIST" "EXCL"))
          (count-fn (find-symbol "FUNCTION-CONSTANT-COUNT" "EXCL"))
          (constant-fn (find-symbol "FUNCTION-CONSTANT" "EXCL"))
          (names
           '("RUN-AARON" "START-WORKING" "FULL-START" "NEW-START"
             "END-START" "GOOD-START" "OMAKE-FRESH-START"
             "MAKE-FRESH-START" "REMAKE-IMAGE" "MAKE-ARTWORK" "MAIN"
             "INITIALISE-PICTURE-PLANE" "DRAW-ONE-COMMAND"
             "DRAW-FIGURE-CFORMS" "DRAW-ORDERED-CFORMS"
             "WRITE-PAINTING-RECORD" "SET-UP-SCREEN-SIZE" "SELECT-CANVAS"
             "INIT-RANDOM" "INIT-MAPS" "MAKE-PAINTING-COLORS"
             "MAKE-COLORSPEC" "MASTER-PLAN" "MAKE-PLAN"
             "MAKE-LEAF-LIST" "DEVELOP-PLAN" "PROTOCOL" "RPARSE"
             "SCRIPT" "BUILD-FIGURE" "GENERATE-PERSON"
             "MAKE-POTTED-PLANT" "SCREEN-AND-STORE" "STORE-IN-FILE")))
      (labels
          ((package-name-safe (symbol)
             (and (symbolp symbol)
                  (symbol-package symbol)
                  (package-name (symbol-package symbol))))
           (short-summary (value)
             (handler-case
                 (cond
                   ((numberp value) (list :number value))
                   ((symbolp value)
                    (list :symbol (package-name-safe value)
                          (symbol-name value)))
                   ((stringp value) (list :string-length (length value)))
                   ((consp value) (list :type (type-of value)))
                   (t (list :type (type-of value))))
               (error () (list :type :summary-error))))
           (safe-arglist (symbol fn)
             (handler-case
                 (multiple-value-list (funcall arglist symbol))
               (error ()
                 (handler-case
                     (multiple-value-list (funcall arglist fn))
                   (error (problem)
                     (list :error (type-of problem)))))))
           (safe-count (fn symbol)
             (handler-case
                 (funcall count-fn fn)
               (error ()
                 (handler-case
                     (funcall count-fn symbol)
                   (error (problem)
                     (list :error (type-of problem))))))))
        (write-line "BEGIN entry-constants" report)
        (format report "HELPERS ARGLIST=~S COUNT=~S CONSTANT=~S~%"
                (and arglist (package-name-safe arglist))
                (and count-fn (package-name-safe count-fn))
                (and constant-fn (package-name-safe constant-fn)))
        (finish-output report)
        (dolist (name names)
          (format report "TRY ~A~%" name)
          (finish-output report)
          (handler-case
              (let* ((symbol (and owner (find-symbol name owner)))
                     (fn (and symbol (fboundp symbol)
                              (symbol-function symbol))))
                (cond
                  ((null symbol)
                   (format report "MISSING-SYMBOL ~A~%" name))
                  ((null fn)
                   (format report "UNBOUND-FUNCTION ~A~%" name))
                  (t
                   (format report "FUNCTION-TYPE ~A ~S~%"
                           name (type-of fn))
                   (when arglist
                     (format report "ARGLIST ~A ~S~%"
                             name (safe-arglist symbol fn)))
                   (if (and count-fn constant-fn
                            (typep fn 'compiled-function))
                       (let ((count (safe-count fn symbol)))
                         (format report "COUNT ~A ~S~%" name count)
                         (when (and (integerp count)
                                    (<= 0 count) (<= count 256))
                           (dotimes (index count)
                             (handler-case
                                 (format report "CONSTANT ~A ~D ~S~%"
                                         name index
                                         (short-summary
                                          (funcall constant-fn fn index)))
                               (error (problem)
                                 (format report "CONSTANT-ERROR ~A ~D ~S~%"
                                         name index (type-of problem)))))))
                     (format report "CONSTANTS-UNAVAILABLE ~A~%" name))))
            (error (problem)
              (format report "ERROR ~A ~S~%" name (type-of problem))))
          (finish-output report))
        (write-line "END entry-constants" report)
        (finish-output report))))))
