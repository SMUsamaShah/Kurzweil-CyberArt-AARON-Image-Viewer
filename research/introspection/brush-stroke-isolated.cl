;;; Dependency-isolated BRUSH-STROKE measurements.
;;;
;;; This probe replaces both downstream/predicate calls before invoking the
;;; original routine. It therefore measures branch dispatch, path expansion,
;;; fill-map writes, and SCREEN-AND-STORE forwarding; it is not an integrated
;;; drawing or AA-file parity test. Fresh private maps and fresh point lists are
;;; used for every case, and all function/global bindings are restored.
(in-package :cl-user)

(with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                        :direction :output :if-exists :supersede
                        :if-does-not-exist :create)
  ;; Keep this in its own top-level form: if a later form fails during
  ;; compilation, the artifact still proves that the probe file was read.
  (format report "BEGIN brush-stroke-isolated~%")
  (format report "INTERVENTION SCREEN-AND-STORE-AND-IN-SUB-FRAME-STUBS~%")
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  ;; Resolve only symbols and function cells before the larger experiment is
  ;; read/compiled. This checkpoint localizes startup/load failures.
  (format report "RESOLVER-BEGIN~%")
  (handler-case
      (let ((owner (find-package "COMMON-GRAPHICS-USER"))
            (graphics (find-package "COMMON-GRAPHICS")))
        (dolist (entry '("MAKE-TWOPT" "X" "Y" "BRUSH-STROKE"
                         "SCREEN-AND-STORE" "IN-SUB-FRAME" "ALL-BRUSHES"
                         "BRUSH" "FILL-MAP" "PATCH-MAP" "*PIC-WIDE*"
                         "*PIC-HIGH*" "BOUNDARY-VALUE" "CDEX" "SDEX"
                         "RAD" "CELLS" "ENVIR" "PERIM" "CORE"))
          (multiple-value-bind (symbol status) (find-symbol entry owner)
            (format report "RESOLVE USER ~S SYMBOL=~S STATUS=~S FBOUND=~S~%"
                    entry (and symbol (symbol-name symbol)) status
                    (and symbol (fboundp symbol)))))
        (dolist (entry '("ID" "WIDTH"))
          (multiple-value-bind (symbol status) (find-symbol entry graphics)
            (format report "RESOLVE GRAPHICS ~S SYMBOL=~S STATUS=~S FBOUND=~S~%"
                    entry (and symbol (symbol-name symbol)) status
                    (and symbol (fboundp symbol)))))
        (format report "RESOLVER-OK~%"))
    (error (problem)
      (format report "RESOLVER-ERROR ~S~%" (type-of problem))))
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (let ((*print-length* 64) (*print-level* 12) (*print-circle* nil)
        (*print-pretty* nil)
        (owner (find-package "COMMON-GRAPHICS-USER"))
        (graphics (find-package "COMMON-GRAPHICS")))
    (labels
        ((required-symbol (name package)
           (multiple-value-bind (symbol status) (find-symbol name package)
             (unless (and symbol (fboundp symbol))
               (error "Missing function ~A in ~A (status ~S)"
                      name (package-name package) status))
             symbol))
         (required-variable (name package)
           (multiple-value-bind (symbol status) (find-symbol name package)
             (unless symbol
               (error "Missing variable symbol ~A in ~A (status ~S)"
                      name (package-name package) status))
             symbol))
         (coords (point x-fn y-fn)
           (handler-case
               (list (funcall x-fn point) (funcall y-fn point))
             (error (problem)
               (list :type (type-of problem)))))
         (point-list (value x-fn y-fn &optional (depth 0))
           (cond
             ((null value) nil)
             ((and (consp value) (< depth 64))
              (cons (handler-case (coords (car value) x-fn y-fn)
                      (error () (list :type (type-of (car value)))))
                    (point-list (cdr value) x-fn y-fn (1+ depth))))
             (t (list :not-a-point-list (type-of value)))))
         (bounded-shape (value &optional (depth 0))
           (cond
             ((or (null value) (numberp value) (symbolp value) (stringp value))
              value)
             ((and (consp value) (< depth 6))
              (cons (bounded-shape (car value) (1+ depth))
                    (bounded-shape (cdr value) (1+ depth))))
             (t (list :type (type-of value)))))
         (nonzero-cells (array)
           (let ((cells nil))
             (dotimes (index (array-total-size array) (nreverse cells))
               (let ((value (row-major-aref array index)))
                 (unless (zerop value)
                   (push (list index value) cells))))))
         (make-path (points make-point)
           (mapcar (lambda (xy) (apply make-point xy)) points))
         (brush-fingerprint (brush id width rad cells envir perim core)
           (list (funcall id brush)
                 (funcall width brush)
                 (funcall rad brush)
                 (funcall cells brush)
                 (copy-tree (funcall envir brush))
                 (copy-tree (funcall perim brush))
                 (copy-tree (funcall core brush))))
      (format report "EXPERIMENT-BEGIN~%")
      (finish-output report)
      (handler-case
          (let* ((make-point (required-symbol "MAKE-TWOPT" owner))
                 (x-fn (required-symbol "X" owner))
                 (y-fn (required-symbol "Y" owner))
                 (stroke (required-symbol "BRUSH-STROKE" owner))
                 (screen (required-symbol "SCREEN-AND-STORE" owner))
                 (inside (required-symbol "IN-SUB-FRAME" owner))
                 (all-symbol (required-variable "ALL-BRUSHES" owner))
                 (brush-symbol (required-variable "BRUSH" owner))
                 (fill-symbol (required-variable "FILL-MAP" owner))
                 (patch-symbol (required-variable "PATCH-MAP" owner))
                 (wide-symbol (required-variable "*PIC-WIDE*" owner))
                 (high-symbol (required-variable "*PIC-HIGH*" owner))
                 (boundary-symbol (required-variable "BOUNDARY-VALUE" owner))
                 (cdex-symbol (required-variable "CDEX" owner))
                 (sdex-symbol (required-variable "SDEX" owner))
                 (id-fn (required-symbol "ID" graphics))
                 (width-fn (required-symbol "WIDTH" graphics))
                 (rad-fn (required-symbol "RAD" owner))
                 (cells-fn (required-symbol "CELLS" owner))
                 (envir-fn (required-symbol "ENVIR" owner))
                 (perim-fn (required-symbol "PERIM" owner))
                 (core-fn (required-symbol "CORE" owner))
                 (original-screen (symbol-function screen))
                 (original-inside (symbol-function inside))
                 (all-brushes (symbol-value all-symbol))
                 (brush-count (length all-brushes)))
            (format report "RESOLVED BRUSHES=~D~%" brush-count)
            (unless (>= brush-count 2)
              (error "Need startup brush indices 0 and 1"))
            (let ((before-brushes
                    (mapcar (lambda (index)
                              (brush-fingerprint (elt all-brushes index)
                                                  id-fn width-fn rad-fn cells-fn
                                                  envir-fn perim-fn core-fn))
                            '(0 1)))
                  (screen-calls nil)
                  (inside-calls nil)
                  (screen-count 0)
                  (inside-count 0)
                  (inside-result nil))
              (unwind-protect
                  (progn
                    (setf (symbol-function screen)
                          (lambda (brush-path cdex sdex)
                            (when (> (incf screen-count) 32)
                              (error "SCREEN-AND-STORE call bound exceeded"))
                            (push (list :cdex cdex :sdex sdex
                                        :path (point-list brush-path x-fn y-fn))
                                  screen-calls)
                            nil))
                    (setf (symbol-function inside)
                          (lambda (x y)
                            (when (> (incf inside-count) 256)
                              (error "IN-SUB-FRAME call bound exceeded"))
                            (push (list x y) inside-calls)
                            inside-result))
                    (dolist (predicate '(nil t))
                      (setf inside-result predicate)
                      (dolist (brush-index '(0 1))
                        (dolist (points '(nil ((7 7)) ((7 7) (8 7))))
                          (dolist (value '(1 3))
                            (let* ((fill-map
                                     (make-array '(16 16)
                                                 :element-type '(unsigned-byte 4)
                                                 :initial-element 0))
                                   (patch-map
                                     (make-array '(16 16)
                                                 :element-type '(unsigned-byte 16)
                                                 :initial-element 0))
                                   (brush (elt all-brushes brush-index))
                                   (path (make-path points make-point)))
                              (setf screen-calls nil inside-calls nil
                                    screen-count 0 inside-count 0)
                              (format report
                                      "CASE PREDICATE=~S BRUSH=~D VALUE=~S POINTS=~S~%"
                                      predicate brush-index value points)
                              (format report "BEFORE-PATH ~S~%"
                                      (point-list path x-fn y-fn))
                              (format report "BEFORE-CALL~%")
                              (finish-output report)
                              (handler-case
                                  (progv (list wide-symbol high-symbol
                                               patch-symbol fill-symbol
                                               brush-symbol boundary-symbol
                                               cdex-symbol sdex-symbol)
                                         (list 16 16 patch-map fill-map brush 3 0 0)
                                    (let ((returns
                                            (multiple-value-list
                                             (funcall stroke path value 0 0))))
                                      (format report "RETURN ~S~%"
                                              (bounded-shape returns))
                                      (format report "AFTER-PATH ~S~%"
                                              (point-list path x-fn y-fn))
                                      (format report "INSIDE-CALLS ~S~%"
                                              (nreverse inside-calls))
                                      (format report "SCREEN-CALLS ~S~%"
                                              (nreverse screen-calls))
                                      (format report "FILL-NONZERO ~S~%"
                                              (nonzero-cells fill-map))
                                      (format report "PATCH-NONZERO ~S~%"
                                              (nonzero-cells patch-map))))
                                (error (problem)
                                  (format report "ERROR ~S~%" (type-of problem))
                                  (when (typep problem 'cell-error)
                                    (let ((cell (cell-error-name problem)))
                                      (when (symbolp cell)
                                        (format report "ERROR-CELL ~S ~S~%"
                                                (and (symbol-package cell)
                                                     (package-name
                                                      (symbol-package cell)))
                                                (symbol-name cell)))))))
                              (format report "ENDCASE~%")
                              (finish-output report)))))))
                (setf (symbol-function screen) original-screen)
                (setf (symbol-function inside) original-inside))
              (let ((after-brushes
                      (mapcar (lambda (index)
                                (brush-fingerprint (elt all-brushes index)
                                                    id-fn width-fn rad-fn cells-fn
                                                    envir-fn perim-fn core-fn))
                              '(0 1))))
                (format report "BRUSHES-UNCHANGED ~S~%"
                        (equalp before-brushes after-brushes))))
            (format report "RESTORED ~S~%"
                    (and (eq (symbol-function screen) original-screen)
                         (eq (symbol-function inside) original-inside))))
        (error (problem)
          (format report "ERROR ~S~%" (type-of problem))))
      (format report "END brush-stroke-isolated~%")
      (finish-output report)))))
