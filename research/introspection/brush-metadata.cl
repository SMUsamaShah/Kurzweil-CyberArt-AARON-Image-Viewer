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
          (owner (find-package "COMMON-GRAPHICS-USER")))
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
               (read-accessor (name object)
                 (let ((symbol (find-owner name)))
                   (when (and symbol (fboundp symbol))
                     (format report "ACCESSOR ~S~%" name)
                     (finish-output report)
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
        ;; The startup BRUSH cell is NIL/unbound in the direct screensaver
        ;; checkpoint.  Do not call accessors until a PAINT-BRUSH object has
        ;; been selected from ALL-BRUSHES in a separate guarded experiment.
        (format report "END brush-metadata~%")
        (finish-output report)))))
