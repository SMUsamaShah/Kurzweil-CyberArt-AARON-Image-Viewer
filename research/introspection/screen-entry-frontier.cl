;;; Guarded direct SCREEN-AND-STORE entry probe.
;;;
;;; This deliberately omits BRUSH-STROKE: its argument forwarding is already
;;; measured.  The original SCREEN-AND-STORE is called once with a private
;;; three-point path, while event pumping, line preparation, plotting, and
;;; file emission are replaced by bounded recorders.  The probe is a
;;; dependency-frontier measurement, not screen/file parity.
(in-package :cl-user)

(with-open-file (report "C:\\temp\\aaron-screen-entry-frontier.txt"
                        :direction :output :if-exists :supersede
                        :if-does-not-exist :create)
  (write-line "BEGIN screen-entry-frontier" report)
  (write-line "INTERVENTION DIRECT-SCREEN-WITH-WATCH-PREP-PLOT-STORE-STUBS"
              report)
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-screen-entry-frontier.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  ;; Keep a read/load checkpoint separate from the larger experiment.  If
  ;; this marker is absent, the runtime rejected the following form before it
  ;; could enter its own handler.
  (write-line "STAGE-0-SECOND-FORM-REACHED" report)
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-screen-entry-frontier.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (let ((*print-length* 32)
        (*print-level* 8)
        (*print-circle* nil)
        (*print-pretty* nil)
        (owner (find-package "COMMON-GRAPHICS-USER")))
    (labels
        ((required-symbol (name)
           (format report "RESOLVE-TRY ~A~%" name)
           (finish-output report)
           (multiple-value-bind (symbol status) (find-symbol name owner)
             (unless symbol
               (error "Missing symbol ~A status ~S" name status))
             (format report "RESOLVE-DONE ~A~%" name)
             (finish-output report)
             symbol))
         (package-name-safe (symbol)
           (and (symbolp symbol)
                (symbol-package symbol)
                (package-name (symbol-package symbol))))
         (symbol-summary (symbol)
           (list :symbol (package-name-safe symbol)
                 (and (symbolp symbol) (symbol-name symbol))))
         (bounded-summary (value &optional (depth 0))
           (cond
             ((numberp value) value)
             ((symbolp value) (symbol-summary value))
             ((stringp value) (list :string (min 80 (length value))))
             ((and (consp value) (< depth 4))
              (list :cons
                    (bounded-summary (car value) (1+ depth))
                    (bounded-summary (cdr value) (1+ depth))))
             (t (list :type (type-of value)))))
         (argument-summary (value x-fn y-fn &optional (depth 0))
           (if (and (< depth 4)
                    (handler-case
                        (and (fboundp x-fn)
                             (fboundp y-fn)
                             (numberp (funcall x-fn value))
                             (numberp (funcall y-fn value)))
                      (error () nil)))
               (list :point (funcall x-fn value) (funcall y-fn value))
             (bounded-summary value depth)))
         (args-summary (args x-fn y-fn)
           (let ((rest args) (items nil) (count 0))
             ;; Do not use LOOP here: the shipped Allegro image may try to
             ;; autoload the absent loop.fasl.  The other probes use DO for
             ;; the same reason.
             (do ()
                 ((or (null rest) (>= count 16)) (nreverse items))
               (push (argument-summary (car rest) x-fn y-fn) items)
               (setf rest (cdr rest))
               (incf count))
             ))
         (write-metadata (name arglist count-fn constant-fn)
           (let ((symbol (find-symbol name owner)))
             (format report "META-SYMBOL ~A PRESENT=~S BOUND=~S FBOUND=~S~%"
                     name (not (null symbol))
                     (and symbol (boundp symbol))
                     (and symbol (fboundp symbol)))
             (when (and symbol (fboundp symbol))
               (handler-case
                   (format report "META-ARGLIST ~A ~S~%"
                           name (multiple-value-list (funcall arglist symbol)))
                 (error (problem)
                   (format report "META-ARGLIST-ERROR ~A ~S~%"
                           name (type-of problem))))
               (handler-case
                   (let ((fn (symbol-function symbol))
                         (count (funcall count-fn (symbol-function symbol))))
                     (format report "META-FUNCTION-TYPE ~A ~S~%"
                             name (type-of fn))
                     (format report "META-CONSTANT-COUNT ~A ~S~%" name count)
                     (when (and (integerp count) (<= 0 count 32))
                       (dotimes (index count)
                         (handler-case
                             (format report "META-CONSTANT ~A ~D ~S~%"
                                     name index
                                     (bounded-summary
                                      (funcall constant-fn fn index)))
                           (error (problem)
                             (format report "META-CONSTANT-ERROR ~A ~D ~S~%"
                                     name index (type-of problem)))))))
                 (error (problem)
                   (format report "META-CONSTANTS-ERROR ~A ~S~%"
                           name (type-of problem)))))))
         (write-cell-error (problem)
           (when (typep problem 'cell-error)
             (let ((cell (cell-error-name problem)))
               (when (symbolp cell)
                 (format report "ERROR-CELL ~S ~S~%"
                         (package-name-safe cell) (symbol-name cell)))))))
      (write-line "RESOLVER-BEGIN" report)
      (finish-output report)
      (handler-case
          (let* ((graphics (find-package "COMMON-GRAPHICS"))
                 (arglist (find-symbol "ARGLIST" "EXCL"))
                 (count-fn (find-symbol "FUNCTION-CONSTANT-COUNT" "EXCL"))
                 (constant-fn (find-symbol "FUNCTION-CONSTANT" "EXCL"))
                 (make-point (required-symbol "MAKE-TWOPT"))
                 (x-fn (required-symbol "X"))
                 (y-fn (required-symbol "Y"))
                 (screen (required-symbol "SCREEN-AND-STORE"))
                 (watch (required-symbol "WATCH-FOR-MESSAGES"))
                 (prep (required-symbol "PREP-LINE"))
                 (plot (required-symbol "PLOT"))
                 (store (required-symbol "STORE-IN-FILE"))
                 (temp-symbol (required-symbol "*TEMP*"))
                 (prev-point-symbol (required-symbol "PREV-STORED-PT"))
                 (file-size-symbol (required-symbol "?FILE-SIZE?"))
                 (prevdex-symbol (required-symbol "PREVDEX"))
                 (cdex-symbol (required-symbol "CDEX"))
                 (sdex-symbol (required-symbol "SDEX"))
                 (path-symbol (required-symbol "BRUSH-PATH"))
                 (mplan-symbol (required-symbol "MPLAN"))
                 (prefs-symbol (required-symbol "PREFS"))
                 (rgb-map-symbol (required-symbol "RGB-MAP"))
                 (large-symbol (required-symbol "LARGE"))
                 (original-watch (symbol-function watch))
                 (original-prep (symbol-function prep))
                 (original-plot (symbol-function plot))
                 (original-store (symbol-function store))
                 (function-symbols (list watch prep plot store))
                 (binding-symbols (list temp-symbol prev-point-symbol
                                         file-size-symbol prevdex-symbol
                                         cdex-symbol sdex-symbol path-symbol
                                         mplan-symbol prefs-symbol))
                 (before-bindings (mapcar #'boundp binding-symbols))
                 (watch-count 0)
                 (prep-count 0)
                 (plot-count 0)
                 (store-count 0)
                 (store-stop nil)
                 (returned nil)
                 (temp-stream (make-string-output-stream))
                 (path (list (funcall make-point 7 7)
                             (funcall make-point 8 7)
                             (funcall make-point 7 7))))
            (declare (ignore graphics))
            (write-line "RESOLVER-OWNER-PACKAGE-OK" report)
            (write-line "RESOLVER-SCREEN-FUNCTION-OK" report)
            (write-line "RESOLVER-DEPENDENCY-FUNCTIONS-OK" report)
            (format report "PATH ~S~%"
                    (mapcar (lambda (point)
                              (argument-summary point x-fn y-fn)) path))
            (format report "RGB-MAP-BOUND ~S~%" (boundp rgb-map-symbol))
            (when (boundp rgb-map-symbol)
              (format report "RGB-MAP-TYPE ~S~%"
                      (type-of (symbol-value rgb-map-symbol))))
            (write-line "METADATA-BEGIN" report)
            (dolist (name '("SCRIPT" "CFLIST" "COLORDEX"
                            "WATCH-FOR-MESSAGES"))
              (write-metadata name arglist count-fn constant-fn))
            (write-line "METADATA-END" report)
            (finish-output report)
            (unwind-protect
                (progn
                  (setf (symbol-function watch)
                        (lambda (&rest args)
                          (when (> (incf watch-count) 32)
                            (error "WATCH-FOR-MESSAGES call bound exceeded"))
                          (format report "WATCH-CALL ~D ~S~%"
                                  watch-count (args-summary args x-fn y-fn))
                          (finish-output report)
                          nil))
                  (setf (symbol-function prep)
                        (lambda (&rest args)
                          (when (> (incf prep-count) 32)
                            (error "PREP-LINE call bound exceeded"))
                          (format report "PREP-LINE-CALL ~D ~S~%"
                                  prep-count (args-summary args x-fn y-fn))
                          (finish-output report)
                          nil))
                  (setf (symbol-function plot)
                        (lambda (&rest args)
                          (when (> (incf plot-count) 32)
                            (error "PLOT call bound exceeded"))
                          (format report "PLOT-CALL ~D ~S~%"
                                  plot-count (args-summary args x-fn y-fn))
                          (finish-output report)
                          nil))
                  (setf (symbol-function store)
                        (lambda (&rest args)
                          (when (> (incf store-count) 32)
                            (error "STORE-IN-FILE call bound exceeded"))
                          (format report "STORE-IN-FILE-CALL ~D ~S~%"
                                  store-count (args-summary args x-fn y-fn))
                          (finish-output report)
                          (setf store-stop t)
                          (error "STAGE-23-STORE-PROBE-STOP")))
                  (progv (list temp-symbol prev-point-symbol file-size-symbol
                               prevdex-symbol cdex-symbol sdex-symbol
                               path-symbol)
                         (list temp-stream nil large-symbol -1 0 0 path)
                    ;; Keep the known startup frontier: do not invent a plan
                    ;; or preferences object to make the call run farther.
                    (progv (list mplan-symbol prefs-symbol) nil
                      (write-line "BEFORE-SCREEN" report)
                      (format report
                              "DYNAMIC CDEX ~S SDEX ~S PREVDEX ~S MPLAN-BOUND ~S PREFS-BOUND ~S~%"
                              (symbol-value cdex-symbol)
                              (symbol-value sdex-symbol)
                              (symbol-value prevdex-symbol)
                              (boundp mplan-symbol)
                              (boundp prefs-symbol))
                      (finish-output report)
                      (handler-case
                          (progn
                            (write-line "SCREEN-CALL-BEGIN" report)
                            (finish-output report)
                            (funcall screen path 0 0)
                            (setf returned t)
                            (write-line "SCREEN-RETURNED" report))
                        (error (problem)
                          (if store-stop
                              (write-line "PROBE-STOP" report)
                            (format report "ERROR-TYPE ~S~%"
                                    (type-of problem)))
                          (write-cell-error problem)
                          (finish-output report)))
                      (format report "PREV-STORED-PT ~S~%"
                              (if (boundp prev-point-symbol)
                                  (argument-summary
                                   (symbol-value prev-point-symbol) x-fn y-fn)
                                :unbound)))))
                  (format report "TEMP-CODES ~S~%"
                          (map 'list #'char-code
                               (get-output-stream-string temp-stream)))
                  (format report "COUNTS WATCH ~D PREP ~D PLOT ~D STORE ~D~%"
                          watch-count prep-count plot-count store-count)
                  (write-line (if returned "CALL-RESULT-RETURNED"
                                  "CALL-RESULT-NOT-RETURNED") report))
              (setf (symbol-function watch) original-watch
                    (symbol-function prep) original-prep
                    (symbol-function plot) original-plot
                    (symbol-function store) original-store)
              (format report "FUNCTIONS-RESTORED ~S~%"
                      (every (lambda (entry)
                              (eq (symbol-function (car entry)) (cdr entry)))
                            (list (cons watch original-watch)
                                  (cons prep original-prep)
                                  (cons plot original-plot)
                                  (cons store original-store))))
              (format report "BINDINGS-RESTORED ~S~%"
                      (equal (mapcar #'boundp binding-symbols)
                             before-bindings))))
        (error (problem)
          (format report "PROBE-ERROR-TYPE ~S~%" (type-of problem))
          (write-cell-error problem)))
      (write-line "END screen-entry-frontier" report)
      (finish-output report)))
