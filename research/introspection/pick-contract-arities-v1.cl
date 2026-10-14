;;; Bounded direct PICK probe for two and four positional fixnums.
;;; This explicit pre-scene experiment calls the original function naturally
;;; with 32 fixed argument lists and restores all random-state bindings before
;;; ordinary scene composition. It does not wrap or replace PICK.
(in-package :cl-user)

(unless (boundp 'aaron-pick-contract-arities-v1-loaded)
  (set 'aaron-pick-contract-arities-v1-loaded :started)
  (with-open-file (report "C:\\temp\\aaron-pick-contract-arities.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (write-line "BEGIN pick-contract-arities-v1" report)
    (finish-output report)))

(defun aaron-pick-contract-arities-emit (control &rest arguments)
  (with-open-file (report "C:\\temp\\aaron-pick-contract-arities.txt"
                          :direction :output :if-exists :append
                          :if-does-not-exist :create)
    (apply #'format report control arguments)
    (terpri report)
    (finish-output report)))

(defun aaron-pick-contract-arities-matching-symbols (names)
  (let ((matches nil))
    (do-all-symbols (symbol)
      (when (and (member (symbol-name symbol) names :test #'string-equal)
                 (not (constantp symbol)))
        (push symbol matches)))
    matches))

(defun aaron-pick-contract-arities-save-bindings (symbols)
  (mapcar (lambda (symbol)
            (list symbol (boundp symbol)
                  (and (boundp symbol) (symbol-value symbol))))
          symbols))

(defun aaron-pick-contract-arities-restore-bindings (bindings)
  (dolist (binding bindings)
    (if (second binding)
        (set (first binding) (third binding))
      (makunbound (first binding)))))

(defun aaron-pick-contract-arities-install-seed
    (seed argc phase state-symbols seed-symbols)
  (aaron-pick-contract-arities-emit
   "SETUP seed=~D argc=~D phase=~A stage=factory-lookup" seed argc phase)
  (let* ((excl-package (find-package "EXCL"))
         (factory (and excl-package
                       (find-symbol "MAKE-RANDOM-STATE-FROM-SEED" excl-package))))
    (unless (and factory (fboundp factory))
      (error "EXCL random-state factory is unavailable"))
    (aaron-pick-contract-arities-emit
     "SETUP seed=~D argc=~D phase=~A stage=factory-call-begin" seed argc phase)
    (let ((state (funcall (symbol-function factory) seed)))
      (unless state (error "MAKE-RANDOM-STATE-FROM-SEED returned NIL"))
      (aaron-pick-contract-arities-emit
       "SETUP seed=~D argc=~D phase=~A stage=factory-call-end" seed argc phase)
      (dolist (symbol state-symbols)
        (aaron-pick-contract-arities-emit
         "SETUP seed=~D argc=~D phase=~A stage=set-state-begin symbol=~A"
         seed argc phase (symbol-name symbol))
        (set symbol state)
        (aaron-pick-contract-arities-emit
         "SETUP seed=~D argc=~D phase=~A stage=set-state-end symbol=~A"
         seed argc phase (symbol-name symbol)))
      (dolist (symbol seed-symbols)
        (aaron-pick-contract-arities-emit
         "SETUP seed=~D argc=~D phase=~A stage=set-seed-begin symbol=~A"
         seed argc phase (symbol-name symbol))
        (set symbol seed)
        (aaron-pick-contract-arities-emit
         "SETUP seed=~D argc=~D phase=~A stage=set-seed-end symbol=~A"
         seed argc phase (symbol-name symbol)))
      (aaron-pick-contract-arities-emit
       "SETUP seed=~D argc=~D phase=~A stage=complete" seed argc phase))))

(defun aaron-pick-contract-arities-call-ran (ran-symbol low high)
  (multiple-value-list (funcall (symbol-function ran-symbol) low high)))

(defun aaron-pick-contract-arities-primary (values)
  (if values (first values) :no-values))

(defun aaron-pick-contract-arities-valid-candidates-p (candidates)
  (and (listp candidates)
       (>= (length candidates) 2)
       (every (lambda (value) (and (typep value 'fixnum) (plusp value)))
              candidates)
       (= (length candidates)
          (length (remove-duplicates candidates :test #'eql)))))

(defun aaron-pick-contract-arities-case
    (seed argc arguments pick-symbol ran-symbol state-symbols seed-symbols)
  (aaron-pick-contract-arities-emit
   "CASE-STAGE seed=~D argc=~D stage=case-enter" seed argc)
  (aaron-pick-contract-arities-emit
   "CASE-STAGE seed=~D argc=~D stage=setup-begin" seed argc)
  (aaron-pick-contract-arities-install-seed
   seed argc "pick" state-symbols seed-symbols)
  (aaron-pick-contract-arities-emit
   "CASE-STAGE seed=~D argc=~D stage=seeded" seed argc)
  (aaron-pick-contract-arities-emit
   "CASE-STAGE seed=~D argc=~D stage=pick-call-begin" seed argc)
  (let* ((pick-result
           (multiple-value-list
            (apply (symbol-function pick-symbol) arguments)))
         (pick-next
           (aaron-pick-contract-arities-primary
            (aaron-pick-contract-arities-call-ran
             ran-symbol 0 1000000)))
         (direct-index nil)
         (direct-next nil)
         (no-draw-next nil))
    (aaron-pick-contract-arities-emit
     "CASE-STAGE seed=~D argc=~D stage=pick-return result=~S pick-next=~S"
     seed argc pick-result pick-next)
    (aaron-pick-contract-arities-install-seed
     seed argc "direct" state-symbols seed-symbols)
    (setf direct-index
          (aaron-pick-contract-arities-primary
           (aaron-pick-contract-arities-call-ran
            ran-symbol 0 (1- argc)))
          direct-next
          (aaron-pick-contract-arities-primary
           (aaron-pick-contract-arities-call-ran
            ran-symbol 0 1000000)))
    (aaron-pick-contract-arities-install-seed
     seed argc "no-draw" state-symbols seed-symbols)
    (setf no-draw-next
          (aaron-pick-contract-arities-primary
           (aaron-pick-contract-arities-call-ran
            ran-symbol 0 1000000)))
    (aaron-pick-contract-arities-emit
     "CASE-STAGE seed=~D argc=~D stage=random-comparisons-complete"
     seed argc)
    (aaron-pick-contract-arities-emit
     "CASE seed=~D argc=~D args=~S result=~S pick-next=~S direct-index=~S direct-next=~S no-draw-next=~S"
     seed argc arguments pick-result pick-next direct-index direct-next
     no-draw-next)))

(when (eq (symbol-value 'aaron-pick-contract-arities-v1-loaded) :started)
  (set 'aaron-pick-contract-arities-v1-loaded :running)
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (pick-symbol (and owner (find-symbol "PICK" owner)))
         (ran-symbol (and owner (find-symbol "RAN" owner)))
         (state-symbols
           (aaron-pick-contract-arities-matching-symbols
            '("*RANDOM-STATE*" "*INTERNAL-RANDOM-STATE*")))
         (seed-symbols
           (aaron-pick-contract-arities-matching-symbols '("?RSEED?")))
         (saved-bindings
           (aaron-pick-contract-arities-save-bindings
            (append state-symbols seed-symbols)))
         (seeds '(1234 5678 1 2 3 4 5 6 7 8 9 10 42 77 2026 65535))
         (candidate-lists '((41 47) (61 67 73 79)))
         (case-count 0)
         (case-error-count 0)
         (fatal nil)
         (restore-error nil))
    (aaron-pick-contract-arities-emit "LOAD-HELPERS-READY")
    (unwind-protect
         (handler-case
             (if (and pick-symbol ran-symbol
                      (fboundp pick-symbol) (fboundp ran-symbol))
                 (progn
                   (aaron-pick-contract-arities-emit
                    "READY pick-package=~A ran-package=~A state-symbols=~D seed-symbols=~D arities=2,4 seeds=16"
                    (package-name (symbol-package pick-symbol))
                    (package-name (symbol-package ran-symbol))
                    (length state-symbols) (length seed-symbols))
                   (unless (= (length state-symbols) 2)
                     (error "Expected exactly two random-state bindings"))
                   (unless (= (length seed-symbols) 1)
                     (error "Expected exactly one random-seed binding"))
                   (dolist (arguments candidate-lists)
                     (unless (aaron-pick-contract-arities-valid-candidates-p
                              arguments)
                       (error "Candidate list is not distinct positive fixnums")))
                   (dolist (arguments candidate-lists)
                     (let ((argc (length arguments)))
                       (dolist (seed seeds)
                         (handler-case
                             (progn
                               (aaron-pick-contract-arities-case
                                seed argc arguments pick-symbol ran-symbol
                                state-symbols seed-symbols)
                               (incf case-count))
                           (condition (problem)
                             (incf case-error-count)
                             (aaron-pick-contract-arities-emit
                              "CASE-ERROR seed=~D argc=~D condition=~S"
                              seed argc (type-of problem))))))))
               (aaron-pick-contract-arities-emit
                "READY status=target-or-ran-unavailable pick-found=~S ran-found=~S"
                (and pick-symbol (fboundp pick-symbol))
                (and ran-symbol (fboundp ran-symbol))))
           (condition (problem)
             (setf fatal t)
             (aaron-pick-contract-arities-emit
              "FATAL condition=~S" (type-of problem))))
      (handler-case
          (aaron-pick-contract-arities-restore-bindings saved-bindings)
        (condition (problem)
          (setf restore-error t)
          (aaron-pick-contract-arities-emit
           "RESTORE-ERROR condition=~S" (type-of problem)))))
    (aaron-pick-contract-arities-emit
     "COMPLETE cases=~D errors=~D fatal=~S restore-error=~S"
     case-count case-error-count fatal restore-error)
    (aaron-pick-contract-arities-emit "END pick-contract-arities-v1")
    (set 'aaron-pick-contract-arities-v1-loaded :complete)))
