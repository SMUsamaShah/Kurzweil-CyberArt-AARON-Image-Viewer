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
        (write-line "MATRIX-CASE b1-horizontal BRUSH 1 VALUE 1 CDEX 0 SDEX 0 INSIDE T"
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
  ;; Second direct case: keep the top-level execution shape while checking
  ;; that a larger startup brush reaches the same isolated map path.
  (let ((matrix-report report))
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
               (all-brushes (symbol-value all-symbol))
               (brush (elt all-brushes 2))
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
               (error-type nil)
               (original-screen (symbol-function screen))
               (original-inside (symbol-function inside)))
          (write-line "MATRIX-CASE b2-horizontal BRUSH 2 VALUE 1 CDEX 0 SDEX 0 INSIDE T"
                      matrix-report)
          (finish-output matrix-report)
          (unwind-protect
              (progv (list wide-symbol high-symbol patch-symbol fill-symbol
                           brush-symbol boundary-symbol cdex-symbol sdex-symbol)
                     (list 16 16 patch-map fill-map brush 3 0 0)
                (setf (symbol-function screen)
                      (lambda (forwarded-path forwarded-cdex forwarded-sdex)
                        (declare (ignore forwarded-path forwarded-cdex forwarded-sdex))
                        (incf screen-count)
                        (format matrix-report "MATRIX-SCREEN b2-horizontal ~D 0 0~%"
                                screen-count)
                        nil))
                (setf (symbol-function inside)
                      (lambda (x y)
                        (declare (ignore x y))
                        (incf inside-count)
                        t))
                (handler-case
                    (progn
                      (write-line "MATRIX-BEFORE-STROKE b2-horizontal" matrix-report)
                      (finish-output matrix-report)
                      (funcall stroke path 1 0 0)
                      (write-line "MATRIX-AFTER-STROKE b2-horizontal" matrix-report)
                      (finish-output matrix-report))
                  (error (problem)
                    (setf error-type (type-of problem))
                    (format matrix-report "MATRIX-ERROR b2-horizontal ~A~%"
                            error-type)
                    (finish-output matrix-report)))
                (dotimes (index (array-total-size fill-map))
                  (let ((value (row-major-aref fill-map index)))
                    (unless (zerop value)
                      (format matrix-report "MATRIX-FILL b2-horizontal ~D ~D~%"
                              index value))))
                (dotimes (index (array-total-size patch-map))
                  (let ((value (row-major-aref patch-map index)))
                    (unless (zerop value)
                      (format matrix-report "MATRIX-PATCH b2-horizontal ~D ~D~%"
                              index value))))
                (format matrix-report "MATRIX-SCREEN-COUNT b2-horizontal ~D~%"
                        screen-count)
                (format matrix-report "MATRIX-INSIDE-COUNT b2-horizontal ~D~%"
                        inside-count)
                (write-line (if error-type "MATRIX-ERRORED" "MATRIX-RETURNED")
                            matrix-report)
                (finish-output matrix-report))
            (setf (symbol-function screen) original-screen
                  (symbol-function inside) original-inside)))
      (error (problem)
        (format matrix-report "STAGE-23-MATRIX-ERROR-B2 ~A~%"
                (type-of problem))
        (finish-output matrix-report))))
+  ;; Additional direct case: keep the top-level execution shape while checking
  ;; that a larger startup brush reaches the same isolated map path.
  (let ((matrix-report report))
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
               (all-brushes (symbol-value all-symbol))
               (brush (elt all-brushes 3))
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
               (error-type nil)
               (original-screen (symbol-function screen))
               (original-inside (symbol-function inside)))
          (write-line "MATRIX-CASE b3-horizontal BRUSH 3 VALUE 1 CDEX 0 SDEX 0 INSIDE T"
                      matrix-report)
          (finish-output matrix-report)
          (unwind-protect
              (progv (list wide-symbol high-symbol patch-symbol fill-symbol
                           brush-symbol boundary-symbol cdex-symbol sdex-symbol)
                     (list 16 16 patch-map fill-map brush 3 0 0)
                (setf (symbol-function screen)
                      (lambda (forwarded-path forwarded-cdex forwarded-sdex)
                        (declare (ignore forwarded-path forwarded-cdex forwarded-sdex))
                        (incf screen-count)
                        (format matrix-report "MATRIX-SCREEN b3-horizontal ~D 0 0~%"
                                screen-count)
                        nil))
                (setf (symbol-function inside)
                      (lambda (x y)
                        (declare (ignore x y))
                        (incf inside-count)
                        t))
                (handler-case
                    (progn
                      (write-line "MATRIX-BEFORE-STROKE b3-horizontal" matrix-report)
                      (finish-output matrix-report)
                      (funcall stroke path 1 0 0)
                      (write-line "MATRIX-AFTER-STROKE b3-horizontal" matrix-report)
                      (finish-output matrix-report))
                  (error (problem)
                    (setf error-type (type-of problem))
                    (format matrix-report "MATRIX-ERROR b3-horizontal ~A~%"
                            error-type)
                    (finish-output matrix-report)))
                (dotimes (index (array-total-size fill-map))
                  (let ((value (row-major-aref fill-map index)))
                    (unless (zerop value)
                      (format matrix-report "MATRIX-FILL b3-horizontal ~D ~D~%"
                              index value))))
                (dotimes (index (array-total-size patch-map))
                  (let ((value (row-major-aref patch-map index)))
                    (unless (zerop value)
                      (format matrix-report "MATRIX-PATCH b3-horizontal ~D ~D~%"
                              index value))))
                (format matrix-report "MATRIX-SCREEN-COUNT b3-horizontal ~D~%"
                        screen-count)
                (format matrix-report "MATRIX-INSIDE-COUNT b3-horizontal ~D~%"
                        inside-count)
                (write-line (if error-type "MATRIX-ERRORED" "MATRIX-RETURNED")
                            matrix-report)
                (finish-output matrix-report))
            (setf (symbol-function screen) original-screen
                  (symbol-function inside) original-inside)))
      (error (problem)
        (format matrix-report "STAGE-23-MATRIX-ERROR-B3 ~A~%"
                (type-of problem))
        (finish-output matrix-report))))
  ;; Additional direct case: keep the top-level execution shape while checking
  ;; that a larger startup brush reaches the same isolated map path.
  (let ((matrix-report report))
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
               (all-brushes (symbol-value all-symbol))
               (brush (elt all-brushes 4))
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
               (error-type nil)
               (original-screen (symbol-function screen))
               (original-inside (symbol-function inside)))
          (write-line "MATRIX-CASE b4-horizontal BRUSH 4 VALUE 1 CDEX 0 SDEX 0 INSIDE T"
                      matrix-report)
          (finish-output matrix-report)
          (unwind-protect
              (progv (list wide-symbol high-symbol patch-symbol fill-symbol
                           brush-symbol boundary-symbol cdex-symbol sdex-symbol)
                     (list 16 16 patch-map fill-map brush 3 0 0)
                (setf (symbol-function screen)
                      (lambda (forwarded-path forwarded-cdex forwarded-sdex)
                        (declare (ignore forwarded-path forwarded-cdex forwarded-sdex))
                        (incf screen-count)
                        (format matrix-report "MATRIX-SCREEN b4-horizontal ~D 0 0~%"
                                screen-count)
                        nil))
                (setf (symbol-function inside)
                      (lambda (x y)
                        (declare (ignore x y))
                        (incf inside-count)
                        t))
                (handler-case
                    (progn
                      (write-line "MATRIX-BEFORE-STROKE b4-horizontal" matrix-report)
                      (finish-output matrix-report)
                      (funcall stroke path 1 0 0)
                      (write-line "MATRIX-AFTER-STROKE b4-horizontal" matrix-report)
                      (finish-output matrix-report))
                  (error (problem)
                    (setf error-type (type-of problem))
                    (format matrix-report "MATRIX-ERROR b4-horizontal ~A~%"
                            error-type)
                    (finish-output matrix-report)))
                (dotimes (index (array-total-size fill-map))
                  (let ((value (row-major-aref fill-map index)))
                    (unless (zerop value)
                      (format matrix-report "MATRIX-FILL b4-horizontal ~D ~D~%"
                              index value))))
                (dotimes (index (array-total-size patch-map))
                  (let ((value (row-major-aref patch-map index)))
                    (unless (zerop value)
                      (format matrix-report "MATRIX-PATCH b4-horizontal ~D ~D~%"
                              index value))))
                (format matrix-report "MATRIX-SCREEN-COUNT b4-horizontal ~D~%"
                        screen-count)
                (format matrix-report "MATRIX-INSIDE-COUNT b4-horizontal ~D~%"
                        inside-count)
                (write-line (if error-type "MATRIX-ERRORED" "MATRIX-RETURNED")
                            matrix-report)
                (finish-output matrix-report))
            (setf (symbol-function screen) original-screen
                  (symbol-function inside) original-inside)))
      (error (problem)
        (format matrix-report "STAGE-23-MATRIX-ERROR-B4 ~A~%"
                (type-of problem))
        (finish-output matrix-report))))
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
