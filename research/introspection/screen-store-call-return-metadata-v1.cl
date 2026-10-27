;;; Passive, read-only pre-scene metadata for SCREEN-AND-STORE.
;;; This probe does not invoke the target, install wrappers, mutate scene state,
;;; or call the random generator. Its only target-memory access is 64 byte reads
;;; through SYSTEM:MEMREF for the compiled function header. After a successful
;;; READY capture it sets one CL-USER guard so a repeated LOAD cannot overwrite
;;; the source-bound report after later scene probes replace the target binding.
(in-package :cl-user)

;;; This is a one-shot source-bound report. Later scene probes may replace the
;;; target binding; a repeated LOAD must not supersede the original READY data.
(unless (boundp 'aaron-screen-store-call-return-metadata-v1-loaded)
  (unless (and (boundp 'aaron-pre-scene-probe-pause-seconds)
               (integerp aaron-pre-scene-probe-pause-seconds)
               (> aaron-pre-scene-probe-pause-seconds 0))
    (error "Expected the runner-owned positive pre-scene pause"))

  (let ((pause-seconds aaron-pre-scene-probe-pause-seconds)
        (report-path
          "C:\\temp\\aaron-screen-store-call-return-metadata-v1.txt")
        (release-path "C:\\temp\\aaron-native-code-release.txt"))
  (with-open-file (report report-path
                          :direction :output
                          :if-exists :supersede
                          :if-does-not-exist :create)
    (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
           (target (and owner (find-symbol "SCREEN-AND-STORE" owner)))
           (target-function
             (and target (fboundp target) (symbol-function target)))
           (system-package (find-package "SYSTEM"))
           (memref-symbol
             (and system-package (find-symbol "MEMREF" system-package)))
           (memref-function
             (and memref-symbol (fboundp memref-symbol)
                  (symbol-function memref-symbol))))
      (format report "BEGIN screen-store-call-return-metadata-v1~%")
      (format report "MODE passive/read-only-metadata~%")
      (unless (and owner target target-function)
        (format report "ERROR target=SCREEN-AND-STORE state=unavailable~%")
        (finish-output report)
        (error "COMMON-GRAPHICS-USER::SCREEN-AND-STORE is unavailable"))
      (unless (eq (type-of target-function) 'compiled-function)
        (format report "ERROR target=SCREEN-AND-STORE state=not-compiled type=~S~%"
                (type-of target-function))
        (finish-output report)
        (error "COMMON-GRAPHICS-USER::SCREEN-AND-STORE is not compiled"))
      (unless memref-function
        (format report "ERROR reader=SYSTEM:MEMREF state=unavailable~%")
        (finish-output report)
        (error "SYSTEM:MEMREF is unavailable"))
      (format report "TARGET name=~S package=~S type=~S~%"
              target
              (package-name (symbol-package target))
              (type-of target-function))
      (format report "HEADER name=~S bytes=" "SCREEN-AND-STORE")
      (dotimes (index 64)
        (format report "~2,'0X"
                (funcall memref-function target-function 0 index
                         :unsigned-byte)))
      (terpri report)
      (format report "READY screen-store-call-return-metadata-v1~%")
      (finish-output report)
      (set 'aaron-screen-store-call-return-metadata-v1-loaded t)))
  (let ((released nil))
    (dotimes (index (* 10 pause-seconds))
      (when (probe-file release-path)
        (setf released t)
        (return))
      (sleep 0.1))
    (unless released
      (error "SCREEN-AND-STORE metadata capture was not released by the runner")))
  (with-open-file (report report-path
                          :direction :output
                          :if-exists :append
                          :if-does-not-exist :create)
    (format report "CAPTURE-WAIT released=T~%")
    (format report "COMPLETE execution=finished~%")
    (format report "END screen-store-call-return-metadata-v1~%")
    (finish-output report)))
)
