;;; Capture original compiled-function metadata before the natural scene.
;;; FREE-PATH stays unwrapped when the seeded planning trace loads; the
;;; breakpoint parent can then identify the code containing its immediate
;;; return address.  This probe neither invokes a function nor mutates code.
(in-package :cl-user)

(set 'aaron-planning-unwrapped-targets '("FREE-PATH"))

(unless (boundp 'aaron-free-path-caller-native-links-loaded)
  (set 'aaron-free-path-caller-native-links-loaded t)
  (let* ((*print-length* 16) (*print-level* 5) (*print-circle* nil)
         (*print-pretty* nil) (*print-readably* nil)
         (owner (find-package "COMMON-GRAPHICS-USER"))
         (memref (find-symbol "MEMREF" "SYSTEM"))
         (names '("FREE-PATH" "DRAW-CFORM"))
         (functions 0) (headers 0) (errors 0))
    (with-open-file (report "C:\\temp\\aaron-free-path-caller-native-links.txt"
                            :direction :output :if-exists :supersede
                            :if-does-not-exist :create)
      (format report "BEGIN free-path-caller-native-links~%")
      (format report "INSTALL targets=2 mode=READ-ONLY-METADATA~%")
      (finish-output report)
      (dolist (name names)
        (handler-case
            (let* ((symbol (and owner (find-symbol name owner)))
                   (function (and symbol (fboundp symbol)
                                  (symbol-function symbol))))
              (unless function (error "Requested function is not bound"))
              (unless (typep function 'compiled-function)
                (error "Requested function is not compiled"))
              (unless memref (error "SYSTEM::MEMREF is unavailable"))
              (incf functions)
              (format report "FUNCTION name=\"~A\" type=COMPILED-FUNCTION~%" name)
              (finish-output report)
              (format report "HEADER name=\"~A\" bytes=" name)
              (dotimes (index 64)
                (format report "~2,'0X"
                        (funcall memref function 0 index :unsigned-byte)))
              (terpri report)
              (incf headers)
              (finish-output report))
          (error (problem)
            (incf errors)
            (format report "ERROR name=~A stage=HEADER type=~S~%"
                    name (type-of problem))
            (finish-output report))))
      (format report
              "TOTALS targets=2 functions=~D headers=~D errors=~D truncations=0~%"
              functions headers errors)
      (format report "ERROR-COUNT ~D~%TRUNCATION-COUNT 0~%" errors)
      (when (and (= functions 2) (= headers 2) (= errors 0))
        (format report "READY free-path-caller-native-links~%"))
      (finish-output report))
    (when (and (= functions 2) (= headers 2) (= errors 0)
               (boundp 'aaron-pre-scene-probe-pause-seconds)
               (> aaron-pre-scene-probe-pause-seconds 0))
      (let ((released nil))
        (dotimes (index (* 10 aaron-pre-scene-probe-pause-seconds))
          (when (probe-file "C:\\temp\\aaron-native-code-release.txt")
            (setf released t)
            (return))
          (sleep 0.1))
        (with-open-file (report "C:\\temp\\aaron-free-path-caller-native-links.txt"
                                :direction :output :if-exists :append)
          (format report "NATIVE-CAPTURE-WAIT released=~S~%" released)
          (when released
            (format report "COMPLETE free-path-caller-native-links~%")
            (format report "END free-path-caller-native-links~%"))
          (finish-output report))
        (unless released
          (error "Native caller capture parent did not release the probe"))))))
