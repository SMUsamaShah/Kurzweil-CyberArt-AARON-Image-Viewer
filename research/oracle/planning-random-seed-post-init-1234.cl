;;; Controlled post-INIT-RANDOM reseed holdout.
(in-package :cl-user)
(set 'aaron-planning-seed 1234)
(set 'aaron-planning-set-rseed nil)
(set 'aaron-planning-reseed-after-init t)
(set 'aaron-ran-sample-limit 512)
(load "C:\\temp\\planning-random-seed-common.cl")
