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

(defun aaron-run-brush-matrix ()
  (with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                          :direction :output :if-exists :append
                          :if-does-not-exist :create)
    ;; Stage 23 is a bounded matrix for the next brush frontier. It keeps the
  ;; original routine isolated from screen output and uses fresh 64x64 maps
  ;; for every case. Interior cases test larger startup brush profiles,
  ;; repeated/gapped vertices, values, and CDEX/SDEX forwarding. The final
  ;; edge case deliberately records the original unchecked boundary behavior
  ;; instead of turning it into a clipping assumption.
  (write-line "STAGE-23-BRUSH-MATRIX-BEGIN" report)
  (finish-output report)
  (handler-case
      (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
             (all-symbol (find-symbol "ALL-BRUSHES" owner))
             (brush-symbol (find-symbol "BRUSH" owner))
             (fill-symbol (find-symbol "FILL-MAP" owner))
             (patch-symbol (find-symbol "PATCH-MAP" owner))
             (wide-symbol (find-symbol "*PIC-WIDE*" owner))
             (high-symbol (find-symbol "*PIC-HIGH*" owner))
             (boundary-symbol (find-symbol "BOUNDARY-VALUE" owner))
             (cdex-symbol (find-symbol "CDEX" owner))
             (sdex-symbol (find-symbol "SDEX" owner))
             (stroke (find-symbol "BRUSH-STROKE" owner))
             (screen (find-symbol "SCREEN-AND-STORE" owner))
             (inside (find-symbol "IN-SUB-FRAME" owner))
             (make-point (find-symbol "MAKE-TWOPT" owner))
             (x-fn (find-symbol "X" owner))
             (y-fn (find-symbol "Y" owner))
             (all-brushes (symbol-value all-symbol)))
        (write-line "MATRIX-RESOLVED" report)
        (finish-output report)
        (labels
            ((make-path (points)
               (mapcar (lambda (xy)
                         (funcall make-point (car xy) (cadr xy)))
                       points))
             (write-cells (prefix name array)
               (dotimes (index (array-total-size array))
                 (let ((value (row-major-aref array index)))
                   (unless (zerop value)
                     (format report "~A ~A ~D ~D~%"
                             prefix name index value)))))
             (run-case (name brush-index points value cdex sdex inside-result)
               (format report "MATRIX-ENTER ~A~%" name)
               (finish-output report)
               (let* ((fill-map (make-array '(64 64)
                                            :element-type '(unsigned-byte 4)
                                            :initial-element 0))
                      (patch-map (make-array '(64 64)
                                             :element-type '(unsigned-byte 16)
                                             :initial-element 0))
                      (brush (elt all-brushes brush-index))
                      (path (make-path points))
                      (screen-count 0)
                      (inside-count 0)
                      (succeeded nil)
                      (original-screen (symbol-function screen))
                      (original-inside (symbol-function inside)))
                 (format report "MATRIX-CASE ~A BRUSH ~D VALUE ~D CDEX ~D SDEX ~D INSIDE ~S~%"
                         name brush-index value cdex sdex inside-result)
                 (finish-output report)
                 (unwind-protect
                     (progv (list wide-symbol high-symbol patch-symbol
                                  fill-symbol brush-symbol boundary-symbol
                                  cdex-symbol sdex-symbol)
                            (list 64 64 patch-map fill-map brush 3 cdex sdex)
                       (setf (symbol-function screen)
                             (lambda (forwarded-path forwarded-cdex forwarded-sdex)
                               (incf screen-count)
                               (format report "MATRIX-SCREEN ~A ~D ~D ~D~%"
                                       name screen-count forwarded-cdex
                                       forwarded-sdex)
                               (let ((tail forwarded-path)
                                     (point-index 0))
                                 (do ()
                                     ((or (null tail) (= point-index 64)))
                                   (if (consp tail)
                                       (let ((point (car tail)))
                                         (handler-case
                                             (format report "MATRIX-POINT ~A ~D ~D ~D~%"
                                                     name point-index
                                                     (funcall x-fn point)
                                                     (funcall y-fn point))
                                           (error ()
                                             (format report "MATRIX-POINT-ERROR ~A ~D~%"
                                                     name point-index)))
                                         (setf tail (cdr tail))
                                         (incf point-index))
                                       (progn
                                         (write-line "MATRIX-IMPROPER-TAIL" report)
                                         (setf tail nil)))))
                               nil))
                       (setf (symbol-function inside)
                             (lambda (x y)
                               (declare (ignore x y))
                               (incf inside-count)
                               (when (> inside-count 4096)
                                 (error "IN-SUB-FRAME matrix bound exceeded"))
                               inside-result))
                       (handler-case
                           (progn
                             (format report "MATRIX-BEFORE-STROKE ~A~%" name)
                             (finish-output report)
                             (funcall stroke path value cdex sdex)
                             (setf succeeded t)
                             (format report "MATRIX-AFTER-STROKE ~A~%" name)
                             (finish-output report))
                         (error (problem)
                           (format report "MATRIX-ERROR ~A ~A~%"
                                   name (type-of problem))))
                       (write-cells "MATRIX-FILL" name fill-map)
                       (write-cells "MATRIX-PATCH" name patch-map)
                       (format report "MATRIX-SCREEN-COUNT ~A ~D~%"
                               name screen-count)
                       (format report "MATRIX-INSIDE-COUNT ~A ~D~%"
                               name inside-count)
                       (write-line (if succeeded
                                       "MATRIX-RETURNED"
                                       "MATRIX-ERRORED")
                                   report))
                   ;; The matrix intentionally changes the global function
                   ;; cells only for the duration of this case.
                   (setf (symbol-function screen)
                         original-screen)
                   (setf (symbol-function inside)
                         original-inside))))
          (dolist (case
                    '(("b1-horizontal" 1 ((32 32) (33 32)) 1 0 0 nil)
                      ("b1-value-15" 1 ((32 32) (33 32)) 15 0 0 nil)
                      ("b1-vertical" 1 ((32 32) (32 33)) 3 0 0 nil)
                      ("b1-gapped" 1 ((32 32) (36 32)) 1 0 0 nil)
                      ("b1-repeated" 1 ((32 32) (33 32) (32 32)) 1 0 0 nil)
                      ("b2-horizontal" 2 ((32 32) (33 32)) 1 0 0 nil)
                      ("b3-horizontal" 3 ((32 32) (33 32)) 1 0 0 nil)
                      ("b4-horizontal" 4 ((32 32) (33 32)) 1 0 0 nil)
                      ("b5-horizontal" 5 ((32 32) (33 32)) 1 0 0 nil)
                      ("b6-horizontal" 6 ((32 32) (33 32)) 1 0 0 nil)
                      ("b1-cdex-sdex" 1 ((32 32) (33 32)) 1 1 1 nil)
                      ("b1-edge-inside" 1 ((0 0) (0 0)) 1 0 0 t)))
            (apply #'run-case case))))
    (error (problem)
      (format report "STAGE-23-ERROR ~A~%" (type-of problem))))
  (write-line "STAGE-23-BRUSH-MATRIX-END" report)
    (finish-output report))))

(with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  ;; Resolve only symbols and function cells before the larger experiment is
  ;; read/compiled. This checkpoint localizes startup/load failures.
  (write-line "RESOLVER-BEGIN" report)
  (handler-case
      (let ((owner (find-package "COMMON-GRAPHICS-USER"))
            (graphics (find-package "COMMON-GRAPHICS")))
        (write-line (if owner "OWNER-PACKAGE-OK" "OWNER-PACKAGE-MISSING")
                    report)
        (write-line (if graphics "GRAPHICS-PACKAGE-OK"
                        "GRAPHICS-PACKAGE-MISSING")
                    report)
        (when owner
          (multiple-value-bind (symbol status)
              (find-symbol "MAKE-TWOPT" owner)
            (declare (ignore status))
            (write-line (if symbol "MAKE-TWOPT-PRESENT"
                            "MAKE-TWOPT-MISSING")
                        report)
            (write-line (if (and symbol (fboundp symbol))
                            "MAKE-TWOPT-FBOUND"
                            "MAKE-TWOPT-NOT-FBOUND")
                        report))
          (multiple-value-bind (symbol status)
              (find-symbol "BRUSH-STROKE" owner)
            (declare (ignore status))
            (write-line (if symbol "BRUSH-STROKE-PRESENT"
                            "BRUSH-STROKE-MISSING")
                        report)
            (write-line (if (and symbol (fboundp symbol))
                            "BRUSH-STROKE-FBOUND"
                            "BRUSH-STROKE-NOT-FBOUND")
                        report))
          (multiple-value-bind (symbol status)
              (find-symbol "SCREEN-AND-STORE" owner)
            (declare (ignore status))
            (write-line (if symbol "SCREEN-AND-STORE-PRESENT"
                            "SCREEN-AND-STORE-MISSING")
                        report)
            (write-line (if (and symbol (fboundp symbol))
                            "SCREEN-AND-STORE-FBOUND"
                            "SCREEN-AND-STORE-NOT-FBOUND")
                        report))
          (multiple-value-bind (symbol status)
              (find-symbol "IN-SUB-FRAME" owner)
            (declare (ignore status))
            (write-line (if symbol "IN-SUB-FRAME-PRESENT"
                            "IN-SUB-FRAME-MISSING")
                        report)
            (write-line (if (and symbol (fboundp symbol))
                            "IN-SUB-FRAME-FBOUND"
                            "IN-SUB-FRAME-NOT-FBOUND")
                        report)))
        (when graphics
          (multiple-value-bind (symbol status)
              (find-symbol "ID" graphics)
            (declare (ignore status))
            (write-line (if symbol "ID-PRESENT" "ID-MISSING") report)
            (write-line (if (and symbol (fboundp symbol))
                            "ID-FBOUND"
                            "ID-NOT-FBOUND")
                        report)))
        (write-line "RESOLVER-OK" report))
    (error (problem)
      (declare (ignore problem))
      (write-line "RESOLVER-ERROR" report)))
  (finish-output report))

#|
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
|#

(with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  ;; Stage 2 isolates mutation of SCREEN-AND-STORE's function cell and a
  ;; direct call to the replacement. No AARON routine is invoked yet.
  (write-line "STAGE-2-SCREEN-BEGIN" report)
  (handler-case
      (let ((owner (find-package "COMMON-GRAPHICS-USER")))
        (multiple-value-bind (screen status)
            (find-symbol "SCREEN-AND-STORE" owner)
          (declare (ignore status))
          (let ((original-screen (symbol-function screen)))
            (unwind-protect
                (progn
                  (setf (symbol-function screen)
                        (lambda (brush-path cdex sdex)
                          (declare (ignore brush-path cdex sdex))
                          nil))
                  (write-line "STAGE-2-SCREEN-SET" report)
                  (funcall (symbol-function screen) nil 0 0)
                  (write-line "STAGE-2-SCREEN-CALL-OK" report))
              (setf (symbol-function screen) original-screen))
            (write-line (if (eq (symbol-function screen) original-screen)
                            "STAGE-2-SCREEN-RESTORED"
                            "STAGE-2-SCREEN-NOT-RESTORED")
                        report))))
    (error (problem)
      (declare (ignore problem))
      (write-line "STAGE-2-SCREEN-ERROR" report)))
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  ;; Stage 22 repeats the rejecting-predicate forwarding probe with SDEX=1.
  ;; Private map state is still dumped after unwind, so this remains a
  ;; dependency-isolated forwarding probe.
  (write-line "STAGE-22-SCREEN-SDEX-1-BEGIN" report)
  (let ((private-fill nil)
        (private-patch nil)
        (private-brush-symbol nil)
        (private-fill-symbol nil)
        (private-patch-symbol nil)
        (private-screen-symbol nil)
        (private-inside-symbol nil)
        (private-original-screen nil)
        (private-original-inside nil)
        (before-brush-bound nil)
        (before-fill-bound nil)
        (before-patch-bound nil)
        (screen-count 0)
        (inside-count 0)
        (success nil))
    (handler-case
        (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
               (all-symbol (find-symbol "ALL-BRUSHES" owner))
               (brush-symbol (find-symbol "BRUSH" owner))
               (fill-symbol (find-symbol "FILL-MAP" owner))
               (patch-symbol (find-symbol "PATCH-MAP" owner))
               (wide-symbol (find-symbol "*PIC-WIDE*" owner))
               (high-symbol (find-symbol "*PIC-HIGH*" owner))
               (boundary-symbol (find-symbol "BOUNDARY-VALUE" owner))
               (cdex-symbol (find-symbol "CDEX" owner))
               (sdex-symbol (find-symbol "SDEX" owner))
               (stroke (find-symbol "BRUSH-STROKE" owner))
               (screen (find-symbol "SCREEN-AND-STORE" owner))
               (inside (find-symbol "IN-SUB-FRAME" owner))
               (x-fn (find-symbol "X" owner))
               (y-fn (find-symbol "Y" owner))
               (all-brushes (symbol-value all-symbol))
               (brush (elt all-brushes 1))
               (make-point (find-symbol "MAKE-TWOPT" owner))
               (path (list (funcall make-point 7 7)
                           (funcall make-point 8 7)
                           (funcall make-point 7 7)))
               (fill-map (make-array '(16 16)
                                     :element-type '(unsigned-byte 4)
                                     :initial-element 0))
               (patch-map (make-array '(16 16)
                                      :element-type '(unsigned-byte 16)
                                      :initial-element 0))
               (original-screen (symbol-function screen))
               (original-inside (symbol-function inside)))
          (setf private-fill fill-map
                private-patch patch-map
                private-brush-symbol brush-symbol
                private-fill-symbol fill-symbol
                private-patch-symbol patch-symbol
                private-screen-symbol screen
                private-inside-symbol inside
                private-original-screen original-screen
                private-original-inside original-inside
                before-brush-bound (boundp brush-symbol)
                before-fill-bound (boundp fill-symbol)
                before-patch-bound (boundp patch-symbol))
          (unwind-protect
                (progv (list wide-symbol high-symbol patch-symbol fill-symbol
                           brush-symbol boundary-symbol cdex-symbol sdex-symbol)
                     (list 16 16 patch-map fill-map brush 3 0 1)
                (setf (symbol-function screen)
                      (lambda (forwarded-path forwarded-cdex forwarded-sdex)
                        (let ((call (incf screen-count)))
                          (when (> call 8)
                            (write-line "SCREEN-CALL-LIMIT" report)
                            (error "SCREEN-AND-STORE call bound exceeded"))
                          (format report "SCREEN-BEGIN ~D~%" call)
                          (if (and (integerp forwarded-cdex)
                                   (integerp forwarded-sdex))
                              (format report "SCREEN-ARGS ~D ~D~%"
                                      forwarded-cdex forwarded-sdex)
                              (write-line "SCREEN-ARGS NONINTEGER" report))
                          (let ((tail forwarded-path)
                                (point-index 0))
                            (do ()
                                ((or (null tail) (= point-index 32)))
                              (if (consp tail)
                                  (let ((point (car tail)))
                                    (handler-case
                                        (let ((x (funcall x-fn point))
                                              (y (funcall y-fn point)))
                                          (if (and (integerp x) (integerp y))
                                              (format report
                                                      "SCREEN-POINT ~D ~D ~D ~D~%"
                                                      call point-index x y)
                                              (format report
                                                      "SCREEN-POINT-NONINTEGER ~D ~D~%"
                                                      call point-index)))
                                      (error (problem)
                                        (declare (ignore problem))
                                        (format report
                                                "SCREEN-POINT-CAPTURE-ERROR ~D ~D~%"
                                                call point-index)))
                                    (setf tail (cdr tail))
                                    (incf point-index))
                                  (progn
                                    (write-line "SCREEN-IMPROPER-TAIL" report)
                                    (setf tail nil))))
                            (when (and (= point-index 32) (consp tail))
                              (format report "SCREEN-TRUNCATED ~D~%" call))
                            (format report "SCREEN-END ~D~%" call)))
                        nil))
                (setf (symbol-function inside)
                      (lambda (x y)
                        (declare (ignore x y))
                        (when (> (incf inside-count) 32)
                          (write-line "INSIDE-CALL-LIMIT" report)
                          (error "IN-SUB-FRAME call bound exceeded"))
                        nil))
                (write-line "BEFORE-STROKE" report)
                (format report "ARGS POSITIONAL-CDEX 0 POSITIONAL-SDEX 1 DYNAMIC-CDEX ~D DYNAMIC-SDEX ~D~%"
                        (symbol-value cdex-symbol)
                        (symbol-value sdex-symbol))
                (finish-output report)
                (funcall stroke path 1 0 1)
                (setf success t)
                (write-line "AFTER-STROKE" report)
                (finish-output report))
            (setf (symbol-function screen) original-screen)
            (setf (symbol-function inside) original-inside)))
      (error (problem)
        (format report "STAGE-22-ERROR-TYPE ~S~%" (type-of problem))
        (when (typep problem 'cell-error)
          (let ((name (cell-error-name problem)))
            (when (symbolp name)
              (format report "STAGE-22-ERROR-CELL ~A~%"
                      (symbol-name name)))))
        (finish-output report)))
    (write-line (if (and private-screen-symbol
                         private-original-screen
                         private-inside-symbol
                         private-original-inside
                         (eq (symbol-function private-screen-symbol)
                             private-original-screen)
                         (eq (symbol-function private-inside-symbol)
                             private-original-inside))
                    "STAGE-22-FUNCTIONS-RESTORED"
                    "STAGE-22-FUNCTIONS-NOT-RESTORED")
                report)
    (write-line (if (and private-brush-symbol
                         private-fill-symbol
                         private-patch-symbol
                         (eql (boundp private-brush-symbol)
                              before-brush-bound)
                         (eql (boundp private-fill-symbol)
                              before-fill-bound)
                         (eql (boundp private-patch-symbol)
                              before-patch-bound))
                    "STAGE-22-BINDINGS-RESTORED"
                    "STAGE-22-BINDINGS-LEAKED")
                report)
    (when (and private-fill private-patch)
      (let ((fill-count 0)
            (patch-count 0))
        (format report "FILL-DIMS ~D ~D~%"
                (array-dimension private-fill 0)
                (array-dimension private-fill 1))
        (format report "PATCH-DIMS ~D ~D~%"
                (array-dimension private-patch 0)
                (array-dimension private-patch 1))
        (dotimes (index (array-total-size private-fill))
          (let ((value (row-major-aref private-fill index)))
            (unless (zerop value)
              (incf fill-count)
              (format report "FILL-CELL ~D ~D~%" index value))))
        (dotimes (index (array-total-size private-patch))
          (let ((value (row-major-aref private-patch index)))
            (unless (zerop value)
              (incf patch-count)
              (format report "PATCH-CELL ~D ~D~%" index value))))
        (format report "FILL-NONZERO-COUNT ~D~%" fill-count)
        (format report "PATCH-NONZERO-COUNT ~D~%" patch-count)))
    (format report "SCREEN-COUNT ~D~%" screen-count)
    (format report "INSIDE-COUNT ~D~%" inside-count)
    (write-line (if success
                    "STAGE-22-STROKE-RETURNED"
                    "STAGE-22-STROKE-ERROR")
                report))
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  ;; Stage 3 performs the same replacement/restoration check for the
  ;; predicate consulted by BRUSH-STROKE.
  (write-line "STAGE-3-INSIDE-BEGIN" report)
  (handler-case
      (let ((owner (find-package "COMMON-GRAPHICS-USER")))
        (multiple-value-bind (inside status)
            (find-symbol "IN-SUB-FRAME" owner)
          (declare (ignore status))
          (let ((original-inside (symbol-function inside)))
            (unwind-protect
                (progn
                  (setf (symbol-function inside)
                        (lambda (x y)
                          (declare (ignore x y))
                          nil))
                  (write-line "STAGE-3-INSIDE-SET" report)
                  (funcall (symbol-function inside) 0 0)
                  (write-line "STAGE-3-INSIDE-CALL-OK" report))
              (setf (symbol-function inside) original-inside))
            (write-line (if (eq (symbol-function inside) original-inside)
                            "STAGE-3-INSIDE-RESTORED"
                            "STAGE-3-INSIDE-NOT-RESTORED")
                        report))))
    (error (problem)
      (declare (ignore problem))
      (write-line "STAGE-3-INSIDE-ERROR" report)))
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  ;; Stage 4 creates the smallest private BRUSH-STROKE environment. It
  ;; validates PROGV setup, map shape, brush selection, and binding cleanup;
  ;; it deliberately does not call BRUSH-STROKE yet.
  (write-line "STAGE-4-PRIVATE-SETUP-BEGIN" report)
  (handler-case
      (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
             (graphics (find-package "COMMON-GRAPHICS"))
             (all-symbol (find-symbol "ALL-BRUSHES" owner))
             (brush-symbol (find-symbol "BRUSH" owner))
             (fill-symbol (find-symbol "FILL-MAP" owner))
             (patch-symbol (find-symbol "PATCH-MAP" owner))
             (wide-symbol (find-symbol "*PIC-WIDE*" owner))
             (high-symbol (find-symbol "*PIC-HIGH*" owner))
             (boundary-symbol (find-symbol "BOUNDARY-VALUE" owner))
             (cdex-symbol (find-symbol "CDEX" owner))
             (sdex-symbol (find-symbol "SDEX" owner))
             (id-symbol (find-symbol "ID" graphics))
             (all-brushes (symbol-value all-symbol)))
        (when (and (listp all-brushes)
                   (>= (length all-brushes) 2)
                   (fboundp id-symbol))
          (let* ((brush (elt all-brushes 1))
                 (fill-map (make-array '(16 16)
                                       :element-type '(unsigned-byte 4)
                                       :initial-element 0))
                 (patch-map (make-array '(16 16)
                                        :element-type '(unsigned-byte 16)
                                        :initial-element 0))
                 (before-brush-bound (boundp brush-symbol))
                 (before-fill-bound (boundp fill-symbol))
                 (before-patch-bound (boundp patch-symbol)))
            (progv (list wide-symbol high-symbol patch-symbol fill-symbol
                         brush-symbol boundary-symbol cdex-symbol sdex-symbol)
                   (list 16 16 patch-map fill-map brush 3 0 0)
              (write-line "STAGE-4-PROGV-ENTERED" report)
              (write-line (if (and (= (symbol-value wide-symbol) 16)
                                     (= (symbol-value high-symbol) 16)
                                     (eq (symbol-value brush-symbol) brush)
                                     (eq (symbol-value fill-symbol) fill-map)
                                     (eq (symbol-value patch-symbol) patch-map)
                                     (= (symbol-value boundary-symbol) 3)
                                     (= (symbol-value cdex-symbol) 0)
                                     (= (symbol-value sdex-symbol) 0))
                                "STAGE-4-BINDINGS-OK"
                                "STAGE-4-BINDINGS-MISMATCH")
                          report)
              (write-line (if (and (equal (array-dimensions
                                           (symbol-value fill-symbol))
                                          '(16 16))
                                     (equal (array-dimensions
                                             (symbol-value patch-symbol))
                                            '(16 16))
                                     (= (funcall id-symbol brush) 1))
                                "STAGE-4-MAPS-AND-BRUSH-OK"
                                "STAGE-4-MAPS-OR-BRUSH-MISMATCH")
                          report))
            (write-line (if (and (eql (boundp brush-symbol) before-brush-bound)
                                   (eql (boundp fill-symbol) before-fill-bound)
                                   (eql (boundp patch-symbol) before-patch-bound))
                              "STAGE-4-BINDINGS-RESTORED"
                              "STAGE-4-BINDINGS-LEAKED")
                        report))))
    (error (problem)
      (declare (ignore problem))
      (write-line "STAGE-4-PRIVATE-SETUP-ERROR" report)))
  (finish-output report))

(defun aaron-run-brush-resolution ()
  (with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                          :direction :output :if-exists :append
                          :if-does-not-exist :create)
    (write-line "STAGE-23-RESOLUTION-BEGIN" report)
    (finish-output report)
    (handler-case
        (let ((owner (find-package "COMMON-GRAPHICS-USER")))
          (write-line (if owner "RESOLVE-OWNER-OK" "RESOLVE-OWNER-MISSING") report)
          (finish-output report)
          (let ((all-symbol (find-symbol "ALL-BRUSHES" owner)))
            (write-line (if all-symbol "RESOLVE-ALL-SYMBOL-OK"
                            "RESOLVE-ALL-SYMBOL-MISSING")
                        report)
            (finish-output report)
            (write-line (if (and all-symbol (boundp all-symbol))
                            "RESOLVE-ALL-BOUND"
                            "RESOLVE-ALL-UNBOUND")
                        report)
            (finish-output report)
            (when (and all-symbol (boundp all-symbol))
              (let ((all-brushes (symbol-value all-symbol)))
                (write-line (if (listp all-brushes)
                                "RESOLVE-ALL-VALUE-LIST"
                                "RESOLVE-ALL-VALUE-NONLIST")
                            report)
                (format report "RESOLVE-ALL-LENGTH ~D~%"
                        (length all-brushes))
                (finish-output report))))
      (error (problem)
        (format report "STAGE-23-RESOLUTION-ERROR ~A~%"
                (type-of problem))
        (finish-output report)))
    (write-line "STAGE-23-RESOLUTION-END" report)
    (finish-output report))))

(with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (write-line "STAGE-23-RESOLUTION-BEGIN" report)
  (finish-output report)
  (handler-case
      (let ((owner (find-package "COMMON-GRAPHICS-USER")))
        (write-line (if owner "RESOLVE-OWNER-OK" "RESOLVE-OWNER-MISSING") report)
        (finish-output report)
        (let ((all-symbol (find-symbol "ALL-BRUSHES" owner)))
          (write-line (if all-symbol "RESOLVE-ALL-SYMBOL-OK"
                          "RESOLVE-ALL-SYMBOL-MISSING")
                      report)
          (finish-output report)
          (write-line (if (and all-symbol (boundp all-symbol))
                          "RESOLVE-ALL-BOUND"
                          "RESOLVE-ALL-UNBOUND")
                      report)
          (finish-output report)
          (when (and all-symbol (boundp all-symbol))
            (let ((all-brushes (symbol-value all-symbol)))
              (write-line (if (listp all-brushes)
                              "RESOLVE-ALL-VALUE-LIST"
                              "RESOLVE-ALL-VALUE-NONLIST")
                          report)
              (format report "RESOLVE-ALL-LENGTH ~D~%"
                      (length all-brushes))
              (finish-output report)))))
    (error (problem)
      (format report "STAGE-23-RESOLUTION-ERROR ~A~%"
              (type-of problem))
      (finish-output report)))
  (write-line "STAGE-23-RESOLUTION-END" report)
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (write-line "STAGE-23-BRUSH-MATRIX-BEGIN" report)
  (finish-output report)
  (handler-case
      (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
             (all-symbol (find-symbol "ALL-BRUSHES" owner))
             (brush-symbol (find-symbol "BRUSH" owner))
             (fill-symbol (find-symbol "FILL-MAP" owner))
             (patch-symbol (find-symbol "PATCH-MAP" owner))
             (wide-symbol (find-symbol "*PIC-WIDE*" owner))
             (high-symbol (find-symbol "*PIC-HIGH*" owner))
             (boundary-symbol (find-symbol "BOUNDARY-VALUE" owner))
             (cdex-symbol (find-symbol "CDEX" owner))
             (sdex-symbol (find-symbol "SDEX" owner))
             (stroke (find-symbol "BRUSH-STROKE" owner))
             (screen (find-symbol "SCREEN-AND-STORE" owner))
             (inside (find-symbol "IN-SUB-FRAME" owner))
             (make-point (find-symbol "MAKE-TWOPT" owner))
             (x-fn (find-symbol "X" owner))
             (y-fn (find-symbol "Y" owner))
             (all-brushes (symbol-value all-symbol))
             (brush (elt all-brushes 1))
             (fill-map (make-array '(16 16)
                                   :element-type '(unsigned-byte 4)
                                   :initial-element 0))
             (patch-map (make-array '(16 16)
                                    :element-type '(unsigned-byte 16)
                                    :initial-element 0))
             (path (list (funcall make-point 7 7)
                         (funcall make-point 8 7)))
             (screen-count 0)
             (inside-count 0)
             (original-screen (symbol-function screen))
             (original-inside (symbol-function inside)))
        (write-line "MATRIX-RESOLVED" report)
        (finish-output report)
        (write-line "MATRIX-CASE b1-horizontal BRUSH 1 VALUE 1 CDEX 0 SDEX 0 INSIDE NIL"
                    report)
        (finish-output report)
        (unwind-protect
            (progv (list wide-symbol high-symbol patch-symbol fill-symbol
                         brush-symbol boundary-symbol cdex-symbol sdex-symbol)
                   (list 16 16 patch-map fill-map brush 3 0 0)
              (setf (symbol-function screen)
                    (lambda (forwarded-path forwarded-cdex forwarded-sdex)
                      (incf screen-count)
                      (format report "MATRIX-SCREEN b1-horizontal ~D ~D ~D~%"
                              screen-count forwarded-cdex forwarded-sdex)
                      (let ((tail forwarded-path)
                            (point-index 0))
                        (do ()
                            ((or (null tail) (= point-index 64)))
                          (when (consp tail)
                            (let ((point (car tail)))
                              (format report "MATRIX-POINT b1-horizontal ~D ~D ~D~%"
                                      point-index (funcall x-fn point)
                                      (funcall y-fn point)))
                            (setf tail (cdr tail))
                            (incf point-index))))
                      nil))
              (setf (symbol-function inside)
                    (lambda (x y)
                      (declare (ignore x y))
                      (incf inside-count)
                      t))
              (handler-case
                  (progn
                    (write-line "MATRIX-BEFORE-STROKE b1-horizontal" report)
                    (finish-output report)
                    (funcall stroke path 1 0 0)
                    (write-line "MATRIX-AFTER-STROKE b1-horizontal" report)
                    (finish-output report))
                (error (problem)
                  (format report "MATRIX-ERROR b1-horizontal ~A~%"
                          (type-of problem))
                  (finish-output report)))
              (dotimes (index (array-total-size fill-map))
                (let ((value (row-major-aref fill-map index)))
                  (unless (zerop value)
                    (format report "MATRIX-FILL b1-horizontal ~D ~D~%"
                            index value))))
              (dotimes (index (array-total-size patch-map))
                (let ((value (row-major-aref patch-map index)))
                  (unless (zerop value)
                    (format report "MATRIX-PATCH b1-horizontal ~D ~D~%"
                            index value))))
              (format report "MATRIX-SCREEN-COUNT b1-horizontal ~D~%"
                      screen-count)
              (format report "MATRIX-INSIDE-COUNT b1-horizontal ~D~%"
                      inside-count)
              (write-line "MATRIX-RETURNED" report)
              (finish-output report))
          (setf (symbol-function screen) original-screen)
          (setf (symbol-function inside) original-inside)))
    (error (problem)
      (format report "STAGE-23-MATRIX-ERROR ~A~%" (type-of problem))
      (finish-output report)))
  (write-line "STAGE-23-BRUSH-MATRIX-END" report)
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-stroke-isolated.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (format report "STAGE-1-RESOLUTION-ONLY~%")
  (format report "STAGE-2-3-REPLACEMENT-ONLY~%")
  (format report "STAGE-4-PRIVATE-SETUP-ONLY~%")
  (format report "STAGE-22-SCREEN-SDEX-1~%")
  (format report "STAGE-23-BRUSH-MATRIX~%")
  (format report "END brush-stroke-isolated~%")
  (finish-output report))
