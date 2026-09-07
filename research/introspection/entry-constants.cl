;;; Read-only entry-symbol and compiled-function checkpoint.
;;;
;;; The symbol/function checkpoints remain separate from each constant read so
;;; an implementation-specific object cannot hide later candidates.
(in-package :cl-user)

(unless (boundp 'aaron-entry-constants-loaded)
  (set 'aaron-entry-constants-loaded t)
  (with-open-file (report "C:\\temp\\aaron-entry-constants.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (write-line "BEGIN entry-constants" report)
    (finish-output report)
    (let ((count-fn (find-symbol "FUNCTION-CONSTANT-COUNT" "EXCL"))
          (constant-fn (find-symbol "FUNCTION-CONSTANT" "EXCL")))
      (labels
          ((short-summary (value)
             (handler-case
                 (cond
                   ((numberp value) (list :number value))
                   ((symbolp value)
                    (list :symbol (and (symbol-package value)
                                       (package-name (symbol-package value)))
                          (symbol-name value)))
                   ((stringp value) (list :string-length (length value)))
                   ((consp value) (list :type (type-of value)))
                   (t (list :type (type-of value))))
               (error () (list :type :summary-error))))
           (try-count (fn symbol)
             (handler-case
                 (funcall count-fn fn)
               (error ()
                 (handler-case
                     (funcall count-fn symbol)
                   (error () nil)))))
           (try-constant (fn index symbol)
             (handler-case
                 (short-summary (funcall constant-fn fn index))
               (error ()
                 (handler-case
                     (short-summary (funcall constant-fn symbol index))
                   (error (problem)
                     (list :error (type-of problem))))))))
        (dolist (name '("DOIT" "STOP-WORKING" "RUN-AARON" "START-WORKING" "FULL-START" "NEW-START"
                    "END-START" "GOOD-START" "OMAKE-FRESH-START"
                    "MAKE-FRESH-START" "REMAKE-IMAGE" "MAKE-ARTWORK" "MAIN"
                    "INITIALISE-PICTURE-PLANE" "DRAW-ONE-COMMAND"
                    "DRAW-FIGURE-CFORMS" "DRAW-ORDERED-CFORMS"
                    "WRITE-PAINTING-RECORD" "SET-UP-SCREEN-SIZE"
                    "SELECT-CANVAS" "INIT-RANDOM" "INIT-MAPS"
                    "MAKE-PAINTING-COLORS" "MAKE-COLORSPEC" "MASTER-PLAN"
                    "MAKE-PLAN" "MAKE-LEAF-LIST" "DEVELOP-PLAN" "PROTOCOL"
                    "RPARSE" "SCRIPT" "BUILD-FIGURE" "GENERATE-PERSON"
                    "MAKE-POTTED-PLANT" "SCREEN-AND-STORE" "STORE-IN-FILE"))
      (format report "TRY ~A~%" name)
      (finish-output report)
      (handler-case
          (let ((symbol (find-symbol name "COMMON-GRAPHICS-USER")))
            (format report "SYMBOL ~A PRESENT ~S~%"
                    name (not (null symbol)))
            (finish-output report)
            (handler-case
                (format report "FBOUNDP ~A ~S~%" name
                        (and symbol (fboundp symbol)))
              (error (problem)
                (format report "FBOUNDP-ERROR ~A ~S~%"
                        name (type-of problem))))
            (finish-output report)
            (when (and symbol (fboundp symbol))
              (handler-case
                  (let ((fn (symbol-function symbol)))
                    (format report "FUNCTION-TYPE ~A ~S~%"
                            name (type-of fn))
                    (if (and count-fn constant-fn
                             (typep fn 'compiled-function))
                        (let ((count (try-count fn symbol)))
                          (format report "COUNT ~A ~S~%" name count)
                          (when (and (integerp count)
                                     (<= 0 count) (<= count 256))
                            (dotimes (index count)
                              (format report "CONSTANT ~A ~D ~S~%"
                                      name index
                                      (try-constant fn index symbol)))))
                      (format report "CONSTANTS-UNAVAILABLE ~A~%" name))
                    (finish-output report))
                (error (problem)
                  (format report "FUNCTION-ERROR ~A ~S~%"
                          name (type-of problem)))))
            (finish-output report))
        (error (problem)
          (format report "RESOLVE-ERROR ~A ~S~%"
                  name (type-of problem))))
          (finish-output report))
        (write-line "END entry-constants" report)
        (finish-output report)))))
