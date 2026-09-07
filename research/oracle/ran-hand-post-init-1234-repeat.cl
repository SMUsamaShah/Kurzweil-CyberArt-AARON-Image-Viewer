;;; Repeated controlled post-INIT-RANDOM RAN-HAND trace, seed 1234.
(in-package :cl-user)
(set 'aaron-planning-seed 1234)
(set 'aaron-planning-set-rseed nil)
(set 'aaron-planning-reseed-after-init t)
(set 'aaron-ran-sample-limit 2048)
(load "C:\\temp\\planning-random-seed-common.cl")
(load "C:\\temp\\ran-hand-trace.cl")
