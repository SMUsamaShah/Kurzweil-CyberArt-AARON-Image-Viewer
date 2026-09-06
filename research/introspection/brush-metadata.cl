;;; Read-only brush-state census.  Do not invoke a drawing routine here.
;;; The startup image may bind BRUSH, ALL-BRUSHES, and FILL-MAP after its
;;; normal initialization; record their types and bounded shapes before
;;; designing a dependency-isolated BRUSH-STROKE call.
(in-package :cl-user)
(unless (boundp 'aaron-brush-metadata-loaded)
  (set 'aaron-brush-metadata-loaded t)
  (with-open-file (report "C:\\temp\\aaron-brush-metadata.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 16) (*print-level* 10) (*print-pretty* nil)
          (owner (find-package "COMMON-GRAPHICS-USER"))
          (arglist (find-symbol "ARGLIST" "EXCL"))
          (count-fn (find-symbol "FUNCTION-CONSTANT-COUNT" "EXCL"))
          (constant-fn (find-symbol "FUNCTION-CONSTANT" "EXCL")))
      (labels ((symbol-info (value)
                 (list :symbol (and (symbol-package value)
                                    (package-name (symbol-package value)))
                       (symbol-name value)))
               (shape (value &optional (depth 0))
                 (cond
                   ((numberp value) (list :number value))
                   ((symbolp value) (symbol-info value))
                   ((stringp value)
                    (list :string (length value)
                          (subseq value 0 (min 120 (length value)))))
                   ((arrayp value)
                    (let ((total (array-total-size value)) (samples nil))
                      (dotimes (index (min total 8))
                        (push (shape (row-major-aref value index) (1+ depth))
                              samples))
                      (list :array (type-of value)
                            :rank (array-rank value)
                            :dimensions (array-dimensions value)
                            :element-type (array-element-type value)
                            :samples (nreverse samples))))
                   ((and (consp value) (< depth 5))
                    (list :cons (shape (car value) (1+ depth))
                          (shape (cdr value) (1+ depth))))
                   (t (list :type (type-of value)))))
               (find-owner (name)
                 (find-symbol name owner))
               (write-global (name)
                 (let ((symbol (find-owner name)))
                   (format report "GLOBAL ~S bound=~S" name (and symbol (boundp symbol)))
                   (when (and symbol (boundp symbol))
                     (handler-case
                         (format report " value=~S" (shape (symbol-value symbol)))
                       (error (problem)
                         (format report " VALUE-ERROR ~S" (type-of problem)))))
                   (terpri report)
                   (finish-output report)))
               (write-function (name)
                 (let ((symbol (find-owner name)))
                   (format report "FUNCTION ~S fbound=~S" name
                           (and symbol (fboundp symbol)))
                   (when (and symbol (fboundp symbol))
                     (handler-case
                         (format report " type=~S arglist=~S"
                                 (type-of (symbol-function symbol))
                                 (and arglist (funcall arglist (symbol-function symbol))))
                       (error (problem)
                         (format report " ARGLIST-ERROR ~S" (type-of problem))))
                     (when count-fn
                       (handler-case
                           (let ((count (funcall count-fn (symbol-function symbol))))
                             (format report " count=~S" count)
                             (when (and constant-fn (integerp count)
                                        (<= 0 count 64))
                               (dotimes (index count)
                                 (format report " CONSTANT ~D ~S" index
                                         (shape (funcall constant-fn
                                                         (symbol-function symbol)
                                                         index))))))
                         (error (problem)
                           (format report " CONSTANT-ERROR ~S" (type-of problem))))))
                   (terpri report)
                   (finish-output report)))
               (read-accessor (name object)
                 (let ((symbol (find-owner name)))
                   (when (and symbol (fboundp symbol))
                     (format report "ACCESSOR ~S" name)
                     (handler-case
                         (format report " RESULT ~S~%"
                                 (shape (funcall (symbol-function symbol) object)))
                       (error (problem)
                         (format report " ERROR ~S~%" (type-of problem))))
                     (finish-output report)))))
        (format report "BEGIN brush-metadata~%")
        (format report "INTERVENTION READ-ONLY-STATE-AND-ACCESSORS~%")
        (dolist (name '("BRUSH" "ALL-BRUSHES" "BOUNDARY-VALUE" "FILL-MAP"
                        "IN-SUB-FRAME" "PERIM" "CORE" "SDEX" "CDEX"
                        "MPLAN" "SCRIPT" "CFLIST" "IDLIST" "PREFS"
                        "COLORDEX" "PREVDEX" "CONTROLS-VISIBLE" "*PIC-WIDE*"
                        "*PIC-HIGH*"))
          (write-global name))
        (dolist (name '("BRUSH-STROKE" "SCREEN-AND-STORE" "RECORD-BRUSH"
                        "SELECT-BRUSH" "WIDTH" "PERIM" "CORE" "IN-SUB-FRAME"
                        "BOUNDARY-VALUE" "FILL-MAP" "BRUSH" "X" "Y"))
          (write-function name))
        (let ((brush-symbol (find-owner "BRUSH")))
          (when (and brush-symbol (boundp brush-symbol))
            (let ((brush (symbol-value brush-symbol)))
              (unless (null brush)
                (format report "BRUSH-ACCESSORS-BEGIN~%")
                (dolist (name '("WIDTH" "PERIM" "CORE" "IN-SUB-FRAME"))
                  (read-accessor name brush))
                (format report "BRUSH-ACCESSORS-END~%")))))
        (format report "END brush-metadata~%")
        (finish-output report)))))
