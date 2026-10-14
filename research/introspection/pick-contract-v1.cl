;;; Bounded direct PICK probe for the observed three-index call shape.
;;; It runs before the ordinary scene and restores every random-state binding
;;; before AARON starts composition. Empty and singleton calls are excluded.
(in-package :cl-user)

(unless (boundp 'aaron-pick-contract-v1-loaded)
  (set 'aaron-pick-contract-v1-loaded :started)
  (with-open-file (report "C:\\temp\\aaron-pick-contract.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (write-line "BEGIN pick-contract-v1" report)
    (finish-output report)))

(defun aaron-pick-contract-emit (control &rest arguments)
  (with-open-file (report "C:\\temp\\aaron-pick-contract.txt"
                          :direction :output :if-exists :append
                          :if-does-not-exist :create)
    (apply #'format report control arguments)
    (terpri report)
    (finish-output report)))

(defun aaron-pick-contract-matching-symbols (names)
  (let ((matches nil))
    (do-all-symbols (symbol)
      (when (and (member (symbol-name symbol) names :test #'string-equal)
                 (not (constantp symbol)))
        (push symbol matches)))
    matches))

(defun aaron-pick-contract-save-bindings (symbols)
  (mapcar (lambda (symbol)
            (list symbol (boundp symbol)
                  (and (boundp symbol) (symbol-value symbol))))
          symbols))

(defun aaron-pick-contract-restore-bindings (bindings)
  (dolist (binding bindings)
    (if (second binding)
        (set (first binding) (third binding))
      (makunbound (first binding)))))

(defun aaron-pick-contract-install-seed (seed state-symbols seed-symbols)
  (aaron-pick-contract-emit "SETUP seed=~D stage=factory-lookup" seed)
  (let* ((excl-package (find-package "EXCL"))
         (factory (and excl-package
                       (find-symbol "MAKE-RANDOM-STATE-FROM-SEED" excl-package))))
    (unless (and factory (fboundp factory))
      (error "EXCL random-state factory is unavailable"))
    (aaron-pick-contract-emit "SETUP seed=~D stage=factory-call-begin" seed)
    (let ((state (funcall (symbol-function factory) seed)))
      (unless state (error "MAKE-RANDOM-STATE-FROM-SEED returned NIL"))
      (aaron-pick-contract-emit "SETUP seed=~D stage=factory-call-end" seed)
      (dolist (symbol state-symbols)
        (aaron-pick-contract-emit "SETUP seed=~D stage=set-state-begin symbol=~A"
                                  seed (symbol-name symbol))
        (set symbol state)
        (aaron-pick-contract-emit "SETUP seed=~D stage=set-state-end symbol=~A"
                                  seed (symbol-name symbol)))
      (dolist (symbol seed-symbols)
        (aaron-pick-contract-emit "SETUP seed=~D stage=set-seed-begin symbol=~A"
                                  seed (symbol-name symbol))
        (set symbol seed)
        (aaron-pick-contract-emit "SETUP seed=~D stage=set-seed-end symbol=~A"
                                  seed (symbol-name symbol)))
      (aaron-pick-contract-emit "SETUP seed=~D stage=complete" seed))))

(defun aaron-pick-contract-call-ran (ran-symbol low high)
  (multiple-value-list (funcall (symbol-function ran-symbol) low high)))

(defun aaron-pick-contract-primary (values)
  (if values (first values) :no-values))

(defun aaron-pick-contract-case (seed argc pick-symbol ran-symbol
                                 state-symbols seed-symbols)
  (aaron-pick-contract-emit "CASE-STAGE seed=~D argc=~D stage=case-enter"
                            seed argc)
  (let ((arguments '(27 28 29))
        (pick-result nil)
        (pick-next nil)
        (direct-index nil)
        (direct-next nil)
        (no-draw-next nil))
    (aaron-pick-contract-emit "CASE-STAGE seed=~D argc=~D stage=setup-begin"
                              seed argc)
    (aaron-pick-contract-install-seed seed state-symbols seed-symbols)
    (aaron-pick-contract-emit
     "CASE-STAGE seed=~D argc=~D stage=seeded" seed argc)
    (setf pick-result
          (handler-case
              (multiple-value-list
               (apply (symbol-function pick-symbol) arguments))
            (condition (problem)
              (list :probe-condition (type-of problem))))
          pick-next (aaron-pick-contract-primary
                     (aaron-pick-contract-call-ran ran-symbol 0 1000000)))
    (aaron-pick-contract-emit
     "CASE-STAGE seed=~D argc=~D stage=pick-return result=~S"
     seed argc pick-result)
    (aaron-pick-contract-install-seed seed state-symbols seed-symbols)
    (when (> argc 0)
      (setf direct-index
            (aaron-pick-contract-primary
             (aaron-pick-contract-call-ran ran-symbol 0 (1- argc)))
            direct-next
            (aaron-pick-contract-primary
             (aaron-pick-contract-call-ran ran-symbol 0 1000000))))
    (aaron-pick-contract-install-seed seed state-symbols seed-symbols)
    (setf no-draw-next
          (aaron-pick-contract-primary
           (aaron-pick-contract-call-ran ran-symbol 0 1000000)))
    (aaron-pick-contract-emit
     "CASE-STAGE seed=~D argc=~D stage=random-comparisons-complete"
     seed argc)
    (aaron-pick-contract-emit
     "CASE seed=~D argc=~D args=~S result=~S pick-next=~S direct-index=~S direct-next=~S no-draw-next=~S"
     seed argc arguments pick-result pick-next direct-index direct-next
     no-draw-next)))

(when (eq (symbol-value 'aaron-pick-contract-v1-loaded) :started)
  (set 'aaron-pick-contract-v1-loaded :running)
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (pick-symbol (and owner (find-symbol "PICK" owner)))
         (ran-symbol (and owner (find-symbol "RAN" owner)))
         (state-symbols
           (aaron-pick-contract-matching-symbols
            '("*RANDOM-STATE*" "*INTERNAL-RANDOM-STATE*")))
         (seed-symbols
           (aaron-pick-contract-matching-symbols '("?RSEED?")))
         (saved-bindings
           (aaron-pick-contract-save-bindings
            (append state-symbols seed-symbols)))
         (seeds '(1234 5678 1 2 3 4 5 6 7 8 9 10 42 77 2026 65535))
         (case-count 0))
    (aaron-pick-contract-emit "LOAD-HELPERS-READY")
    (unwind-protect
         (progn
           (if (and pick-symbol ran-symbol
                    (fboundp pick-symbol) (fboundp ran-symbol))
               (progn
                 (aaron-pick-contract-emit
                  "READY pick-package=~A ran-package=~A state-symbols=~D seed-symbols=~D"
                  (package-name (symbol-package pick-symbol))
                  (package-name (symbol-package ran-symbol))
                  (length state-symbols) (length seed-symbols))
                 ;; Use only the natural three-candidate call shape; do not
                 ;; generalize its minimum arity or behavior for other values.
                 (dolist (seed seeds)
                   (handler-case
                       (progn
                         (aaron-pick-contract-case
                          seed 3 pick-symbol ran-symbol
                          state-symbols seed-symbols)
                         (incf case-count))
                     (condition (problem)
                       (aaron-pick-contract-emit
                        "CASE-ERROR seed=~D argc=3 condition=~S"
                        seed (type-of problem))))))
             (aaron-pick-contract-emit
              "READY status=target-or-ran-unavailable pick-found=~S ran-found=~S"
              (and pick-symbol (fboundp pick-symbol))
              (and ran-symbol (fboundp ran-symbol))))
           (aaron-pick-contract-emit "COMPLETE cases=~D" case-count))
      (aaron-pick-contract-restore-bindings saved-bindings))
    (aaron-pick-contract-emit "END pick-contract-v1")
    (set 'aaron-pick-contract-v1-loaded :complete)))
